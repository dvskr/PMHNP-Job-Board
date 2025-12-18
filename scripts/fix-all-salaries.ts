import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { processSalary, extractSalaryFromDescription } from '../lib/salary-utils';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function fixAllSalaries() {
  console.log('💰 SALARY SYSTEM OVERHAUL\n');
  console.log('='.repeat(60));
  console.log('Approach: Store Both (Normalized + Display)\n');

  const stats = {
    alreadyCorrect: 0,
    fixedFromRaw: 0,
    extractedFromDescription: 0,
    correctedHighValues: 0,
    noDataAvailable: 0,
    errors: 0,
  };

  // Get all published jobs
  const jobs = await prisma.job.findMany({
    where: { isPublished: true },
    select: {
      id: true,
      title: true,
      employer: true,
      minSalary: true,
      maxSalary: true,
      salaryRange: true,
      salaryPeriod: true,
      description: true,
      normalizedMinSalary: true,
      normalizedMaxSalary: true,
      displaySalary: true,
    },
  });

  console.log(`Processing ${jobs.length} jobs...\n`);

  for (const job of jobs) {
    try {
      let processed = null;
      let source = '';

      // PRIORITY 1: Fix suspiciously high values (> $400k)
      // These are likely hourly rates converted with wrong factor
      if (job.normalizedMaxSalary && job.normalizedMaxSalary > 400000) {
        // Check if original was hourly
        const rawLower = (job.salaryRange || '').toLowerCase();
        const typeLower = (job.salaryPeriod || '').toLowerCase();
        
        if (rawLower.includes('hr') || rawLower.includes('hour') || typeLower.includes('hour')) {
          // Re-process as hourly with correct conversion
          processed = processSalary({
            min: job.minSalary,
            max: job.maxSalary,
            raw: job.salaryRange,
            type: 'hourly',
          });
          source = 'corrected-high';
          if (processed.isValid) {
            stats.correctedHighValues++;
            console.log(`🔧 Fixed high value: ${job.title}`);
            console.log(`   Was: $${job.normalizedMaxSalary?.toLocaleString()}/yr`);
            console.log(`   Now: ${processed.displaySalary} (normalized: $${processed.normalizedMax?.toLocaleString()})`);
          }
        }
      }

      // PRIORITY 2: Process raw salary data
      if (!processed && (job.minSalary || job.maxSalary || job.salaryRange)) {
        processed = processSalary({
          min: job.minSalary,
          max: job.maxSalary,
          raw: job.salaryRange,
          type: job.salaryPeriod,
        });
        
        if (processed.isValid) {
          // Check if this is actually different from current
          if (
            processed.normalizedMin !== job.normalizedMinSalary ||
            processed.normalizedMax !== job.normalizedMaxSalary
          ) {
            source = 'raw-data';
            stats.fixedFromRaw++;
          } else if (job.displaySalary === processed.displaySalary) {
            stats.alreadyCorrect++;
            continue; // No update needed
          } else {
            source = 'display-update';
            stats.fixedFromRaw++;
          }
        }
      }

      // PRIORITY 3: Extract from description if still no salary
      if (!processed?.isValid && job.description) {
        const extracted = extractSalaryFromDescription(job.description);
        if (extracted) {
          processed = processSalary(extracted);
          if (processed.isValid) {
            source = 'description';
            stats.extractedFromDescription++;
            console.log(`📝 Extracted: ${job.title} → ${processed.displaySalary}`);
          }
        }
      }

      // Update job if we have valid processed data
      if (processed?.isValid) {
        await prisma.job.update({
          where: { id: job.id },
          data: {
            normalizedMinSalary: processed.normalizedMin,
            normalizedMaxSalary: processed.normalizedMax,
            displaySalary: processed.displaySalary,
            salaryPeriod: processed.salaryType,
          },
        });
      } else if (!job.normalizedMinSalary && !job.normalizedMaxSalary) {
        stats.noDataAvailable++;
      }

    } catch (error) {
      console.error(`Error processing job ${job.id}:`, error);
      stats.errors++;
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESULTS:\n');
  console.log(`  ✅ Already correct: ${stats.alreadyCorrect}`);
  console.log(`  🔧 Fixed from raw data: ${stats.fixedFromRaw}`);
  console.log(`  📝 Extracted from descriptions: ${stats.extractedFromDescription}`);
  console.log(`  ⚠️  Corrected high values: ${stats.correctedHighValues}`);
  console.log(`  ❌ No data available: ${stats.noDataAvailable}`);
  console.log(`  🚫 Errors: ${stats.errors}`);

  // Final counts
  const finalStats = await prisma.job.aggregate({
    where: { isPublished: true },
    _count: { _all: true },
  });

  const withSalary = await prisma.job.count({
    where: {
      isPublished: true,
      OR: [
        { normalizedMinSalary: { not: null } },
        { normalizedMaxSalary: { not: null } },
      ],
    },
  });

  const withDisplay = await prisma.job.count({
    where: {
      isPublished: true,
      displaySalary: { not: null },
    },
  });

  console.log('\n📈 FINAL COVERAGE:');
  console.log(`  Total jobs: ${finalStats._count._all}`);
  console.log(`  With normalized salary: ${withSalary} (${(withSalary / finalStats._count._all * 100).toFixed(1)}%)`);
  console.log(`  With display salary: ${withDisplay} (${(withDisplay / finalStats._count._all * 100).toFixed(1)}%)`);

  // Sample output
  console.log('\n📋 SAMPLE JOBS WITH NEW DISPLAY FORMAT:');
  const samples = await prisma.job.findMany({
    where: {
      isPublished: true,
      displaySalary: { not: null },
    },
    select: {
      title: true,
      displaySalary: true,
      salaryPeriod: true,
      normalizedMinSalary: true,
    },
    orderBy: {
      normalizedMaxSalary: 'desc',
    },
    take: 10,
  });

  samples.forEach((job: typeof samples[number]) => {
    console.log(`  • ${job.title}`);
    console.log(`    Display: ${job.displaySalary} | Type: ${job.salaryPeriod} | Normalized: $${job.normalizedMinSalary?.toLocaleString()}`);
  });

  await prisma.$disconnect();
  console.log('\n✅ Done!\n');
}

fixAllSalaries().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

