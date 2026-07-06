/**
 * Re-Normalize Salary Data for Existing Jobs
 *
 * Re-processes all published jobs through the current salary normalization
 * logic. As of 2026-07-06 (audit #13) that logic drops implausible values
 * (beyond ±15% of the band) instead of clamping them, so this script also
 * CLEARS previously fabricated normalized/display values when the new logic
 * yields none, and refreshes displaySalary to match.
 *
 * Usage:
 *   npx tsx scripts/renormalize-salaries.ts --dry-run   # report only, no writes
 *   npx tsx scripts/renormalize-salaries.ts             # apply changes
 */

// Load environment variables
import { config } from 'dotenv';
import { resolve } from 'path';

// Try to load .env.local first, then .env
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

import { prisma } from '../lib/prisma';
import { normalizeSalary } from '../lib/salary-normalizer';
import { formatDisplaySalary } from '../lib/salary-display';

const DRY_RUN = process.argv.includes('--dry-run');

interface Stats {
  total: number;
  hadRawSalary: number;
  previouslyNormalized: number;
  newlyNormalized: number;
  cleared: number;
  unchanged: number;
  stillNoSalary: number;
  updated: number;
  errors: number;
}

interface SourceBreakdown {
  [source: string]: {
    total: number;
    before: number;
    after: number;
  };
}

async function renormalizeSalaries() {
  console.log('🔄 Starting salary re-normalization for all jobs...\n');
  console.log('This will apply the updated salary validation logic that accepts');
  console.log('high hourly rates ($200-350/hour) for PMHNP contractors.\n');
  console.log('=' .repeat(80) + '\n');
  
  const stats: Stats = {
    total: 0,
    hadRawSalary: 0,
    previouslyNormalized: 0,
    newlyNormalized: 0,
    cleared: 0,
    unchanged: 0,
    stillNoSalary: 0,
    updated: 0,
    errors: 0,
  };

  if (DRY_RUN) {
    console.log('🧪 DRY RUN — no database writes will be performed.\n');
  }

  const sourceBreakdown: SourceBreakdown = {};

  // Fetch all published jobs
  console.log('📥 Fetching all published jobs from database...');
  const jobs = await prisma.job.findMany({
    where: { isPublished: true },
    select: {
      id: true,
      title: true,
      employer: true,
      sourceProvider: true,
      minSalary: true,
      maxSalary: true,
      salaryPeriod: true,
      salaryRange: true,
      description: true,
      normalizedMinSalary: true,
      normalizedMaxSalary: true,
      displaySalary: true,
      salaryIsEstimated: true,
    },
  });

  stats.total = jobs.length;
  console.log(`   Found ${jobs.length} published jobs\n`);

  // Initialize source breakdown
  for (const job of jobs) {
    const source = job.sourceProvider || 'unknown';
    if (!sourceBreakdown[source]) {
      sourceBreakdown[source] = { total: 0, before: 0, after: 0 };
    }
    sourceBreakdown[source].total++;
    
    if (job.normalizedMinSalary || job.normalizedMaxSalary) {
      sourceBreakdown[source].before++;
      stats.previouslyNormalized++;
    }
  }

  console.log('📊 Current State:');
  console.log(`   Jobs with normalized salary: ${stats.previouslyNormalized}/${stats.total} (${(stats.previouslyNormalized / stats.total * 100).toFixed(1)}%)\n`);

  // Process in batches
  const BATCH_SIZE = 50;
  const batches: typeof jobs[] = [];
  
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    batches.push(jobs.slice(i, i + BATCH_SIZE));
  }

  console.log(`🔄 Processing ${batches.length} batches (${BATCH_SIZE} jobs per batch)...\n`);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchNum = batchIndex + 1;
    
    process.stdout.write(`   Batch ${batchNum}/${batches.length}: Processing ${batch.length} jobs... `);

    let batchUpdated = 0;
    let batchNew = 0;

    for (const job of batch) {
      try {
        const hadBefore = job.normalizedMinSalary !== null || job.normalizedMaxSalary !== null;
        
        // Track if job has raw salary data
        if (job.minSalary || job.maxSalary) {
          stats.hadRawSalary++;
        }

        // Skip if no raw salary data. Rows with normalized-but-no-raw values
        // are LLM-enriched extractions (the enrichment pipeline is their
        // owner) — leave them alone rather than clearing them.
        if (!job.minSalary && !job.maxSalary) {
          stats.stillNoSalary++;
          continue;
        }

        // Provenance guard (2026-07-06): LLM-enriched salaries are stored
        // with salaryPeriod='year' (ingest always writes 'annual') and no
        // source salaryRange (the regex pass found nothing, so the LLM
        // filled it). Re-deriving them from raw fields here wiped the
        // estimated flag/confidence — the enrichment pipeline owns these
        // rows; skip them. 'year' rows WITH a salaryRange are maintenance
        // relabels (scripts/fix-stale-salary-periods.ts) and are fair game.
        // (scripts/repair-enriched-salaries.ts restores rows damaged before
        // this guard existed.)
        if (job.salaryPeriod === 'year' && !job.salaryRange) {
          stats.unchanged++;
          const source = job.sourceProvider || 'unknown';
          sourceBreakdown[source].after++;
          continue;
        }

        // Re-normalize using updated logic
        const normalized = normalizeSalary({
          salaryRange: job.salaryRange,
          minSalary: job.minSalary,
          maxSalary: job.maxSalary,
          salaryPeriod: job.salaryPeriod,
          title: job.title,
        });

        // Check if normalization produced results
        const hasNow = normalized.normalizedMinSalary !== null || normalized.normalizedMaxSalary !== null;
        const newDisplaySalary = formatDisplaySalary(
          normalized.normalizedMinSalary,
          normalized.normalizedMaxSalary,
          job.salaryPeriod
        );

        const changed =
          normalized.normalizedMinSalary !== job.normalizedMinSalary ||
          normalized.normalizedMaxSalary !== job.normalizedMaxSalary ||
          newDisplaySalary !== job.displaySalary;

        if (!changed) {
          stats.unchanged++;
          if (hasNow) {
            const source = job.sourceProvider || 'unknown';
            sourceBreakdown[source].after++;
          } else {
            stats.stillNoSalary++;
          }
          continue;
        }

        // Write both the recomputed normalization AND the display string;
        // when the new policy yields null this CLEARS previously fabricated
        // values (e.g. a $38k posting stored/displayed as "$64k/yr").
        if (!DRY_RUN) {
          await prisma.job.update({
            where: { id: job.id },
            data: {
              normalizedMinSalary: normalized.normalizedMinSalary,
              normalizedMaxSalary: normalized.normalizedMaxSalary,
              salaryConfidence: hasNow ? normalized.salaryConfidence : null,
              salaryIsEstimated: normalized.salaryIsEstimated,
              displaySalary: newDisplaySalary,
            },
          });
        }

        stats.updated++;
        batchUpdated++;

        if (hasNow) {
          const source = job.sourceProvider || 'unknown';
          sourceBreakdown[source].after++;

          // Check if this is a NEW normalization (previously failed, now succeeds)
          if (!hadBefore) {
            stats.newlyNormalized++;
            batchNew++;

            // Log NEW normalizations (previously rejected, now accepted)
            console.log(`\n   ✨ NEW: ${job.title.substring(0, 50)}...`);
            console.log(`      Source: ${job.sourceProvider} | Employer: ${job.employer}`);
            console.log(`      Raw: $${job.minSalary || '?'}${job.maxSalary ? `-${job.maxSalary}` : ''} ${job.salaryPeriod || 'annual'}`);
            console.log(`      Normalized: $${normalized.normalizedMinSalary?.toLocaleString() || '?'}${normalized.normalizedMaxSalary ? `-${normalized.normalizedMaxSalary.toLocaleString()}` : ''} annual`);
            process.stdout.write(`   Batch ${batchNum}/${batches.length}: `);
          }
        } else {
          stats.stillNoSalary++;
          if (hadBefore) {
            stats.cleared++;
            console.log(`\n   🧹 CLEARED: ${job.title.substring(0, 50)}...`);
            console.log(`      Source: ${job.sourceProvider} | Raw: $${job.minSalary || '?'}${job.maxSalary ? `-${job.maxSalary}` : ''} ${job.salaryPeriod || '(no period)'}`);
            console.log(`      Was: ${job.displaySalary || `$${job.normalizedMinSalary?.toLocaleString()}+`} — implausible under the bounded-clamp policy`);
            process.stdout.write(`   Batch ${batchNum}/${batches.length}: `);
          }
        }
      } catch (error: unknown) {
        stats.errors++;
        console.error(`\n   ❌ Error processing job ${job.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log(`✅ ${batchUpdated} updated (${batchNew} new)`);
  }

  // Final report
  console.log('\n' + '='.repeat(80));
  console.log('🎉 RE-NORMALIZATION COMPLETE');
  console.log('='.repeat(80));
  
  console.log('\n📊 Overall Statistics:');
  console.log(`   Total jobs processed:           ${stats.total}`);
  console.log(`   Jobs with raw salary data:      ${stats.hadRawSalary} (${(stats.hadRawSalary / stats.total * 100).toFixed(1)}%)`);
  console.log(`   Previously normalized:          ${stats.previouslyNormalized} (${(stats.previouslyNormalized / stats.total * 100).toFixed(1)}%)`);
  console.log(`   ${DRY_RUN ? 'Updates that WOULD be made:  ' : 'Database updates performed:  '}   ${stats.updated}`);
  console.log(`   Unchanged (no write needed):    ${stats.unchanged}`);
  console.log(`   NEW normalizations (recovered): ${stats.newlyNormalized} 🎯`);
  console.log(`   CLEARED fabricated values:      ${stats.cleared} 🧹`);
  console.log(`   Still no salary:                ${stats.stillNoSalary} (${(stats.stillNoSalary / stats.total * 100).toFixed(1)}%)`);
  console.log(`   Errors:                         ${stats.errors}`);

  // Calculate final normalized count
  const finalNormalized = Object.values(sourceBreakdown).reduce((sum, s) => sum + s.after, 0);
  const finalPercentage = (finalNormalized / stats.total * 100).toFixed(1);
  
  console.log('\n📈 Before vs After:');
  console.log(`   Before: ${stats.previouslyNormalized}/${stats.total} (${(stats.previouslyNormalized / stats.total * 100).toFixed(1)}%)`);
  console.log(`   After:  ${finalNormalized}/${stats.total} (${finalPercentage}%) 🚀`);
  console.log(`   Improvement: +${finalNormalized - stats.previouslyNormalized} jobs (+${(finalNormalized - stats.previouslyNormalized) / stats.total * 100 < 0.1 ? '<0.1' : ((finalNormalized - stats.previouslyNormalized) / stats.total * 100).toFixed(1)}%)`);

  console.log('\n📊 Results by Source:');
  console.log('   ' + '-'.repeat(76));
  console.log('   Source          Total    Before    After     Change    Coverage');
  console.log('   ' + '-'.repeat(76));
  
  // Sort by total jobs descending
  const sortedSources = Object.entries(sourceBreakdown).sort((a, b) => b[1].total - a[1].total);
  
  for (const [source, data] of sortedSources) {
    // const beforePct = (data.before / data.total * 100).toFixed(1); // Percentage tracking (currently unused)
    const afterPct = (data.after / data.total * 100).toFixed(1);
    const change = data.after - data.before;
    const changeStr = change > 0 ? `+${change}` : `${change}`;
    // const changePct = change > 0 ? ` (+${(change / data.total * 100).toFixed(1)}%)` : ''; // Change percentage (currently unused)
    
    console.log(
      `   ${source.padEnd(15)} ${data.total.toString().padStart(5)}    ` +
      `${data.before.toString().padStart(5)}    ${data.after.toString().padStart(5)}    ` +
      `${changeStr.padStart(6)}    ${afterPct}%${change > 0 ? ' 🎯' : ''}`
    );
  }
  console.log('   ' + '-'.repeat(76));

  // Highlight biggest wins
  console.log('\n🏆 Biggest Improvements:');
  const improvements = sortedSources
    .map(([source, data]) => ({
      source,
      improvement: data.after - data.before,
      improvementPct: ((data.after - data.before) / data.total * 100),
    }))
    .filter(item => item.improvement > 0)
    .sort((a, b) => b.improvement - a.improvement)
    .slice(0, 3);

  if (improvements.length === 0) {
    console.log('   No new normalizations (all jobs already normalized correctly)');
  } else {
    improvements.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.source}: +${item.improvement} jobs (+${item.improvementPct.toFixed(1)}%)`);
    });
  }

  await prisma.$disconnect();
}

// Run the script
console.log('╔════════════════════════════════════════════════════════════════════════════╗');
console.log('║                    SALARY RE-NORMALIZATION SCRIPT                          ║');
console.log('╚════════════════════════════════════════════════════════════════════════════╝');
console.log();

renormalizeSalaries()
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    console.log('\nNext steps:');
    console.log('   1. Verify results in database');
    console.log('   2. Check job cards display salary correctly');
    console.log('   3. Monitor for any issues\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });

