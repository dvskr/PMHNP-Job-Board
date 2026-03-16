/**
 * RECOVER REJECTED JOBS — One-Time Recovery Script
 * =================================================
 * Re-processes the 98 recoverable PMHNP jobs from rejected_jobs table
 * using the current (fixed) normalizer pipeline.
 *
 * Usage:
 *   npx tsx scripts/recover-rejected-jobs.ts --dry-run   # Preview only
 *   npx tsx scripts/recover-rejected-jobs.ts              # Actually insert
 */
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.prod' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const connString = process.env.PROD_DATABASE_URL;
if (!connString) {
    console.error('❌ PROD_DATABASE_URL not found'); process.exit(1);
}

const isDryRun = process.argv.includes('--dry-run');
const pool = new Pool({ connectionString: connString });

// PMHNP-relevant title patterns (same as analysis script)
const PMHNP_TITLE_PATTERNS = `
  LOWER(title) LIKE '%pmhnp%'
  OR LOWER(title) LIKE '%psychiatric nurse%'
  OR LOWER(title) LIKE '%psychiatric mental health%'
  OR LOWER(title) LIKE '%psych np%'
  OR LOWER(title) LIKE '%psychiatric aprn%'
  OR LOWER(title) LIKE '%psychiatric arnp%'
  OR LOWER(title) LIKE '%mental health np%'
  OR LOWER(title) LIKE '%psychiatric prescriber%'
  OR LOWER(title) LIKE '%psych nurse practitioner%'
  OR LOWER(title) LIKE '%mental health nurse practitioner%'
  OR LOWER(title) LIKE '%psychiatric%nurse%'
  OR LOWER(title) LIKE '%psychiatry nurse practitioner%'
  OR LOWER(title) LIKE '%licensed psychiatric%'
`;

function generateSlug(title: string, id: string): string {
    return `${title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim()}-${id}`;
}

async function main() {
    const client = await pool.connect();

    console.log(`🔄 RECOVER REJECTED JOBS ${isDryRun ? '(DRY RUN)' : '(LIVE)'}`);
    console.log(`📅 ${new Date().toISOString()}\n`);

    // Step 1: Find recoverable jobs (PMHNP-relevant + NOT in accepted DB)
    const recoverable = await client.query(`
    SELECT r.id, r.title, r.employer, r.location, r.apply_link, r.external_id,
           r.source_provider, r.raw_data, r.created_at
    FROM rejected_jobs r
    WHERE (${PMHNP_TITLE_PATTERNS})
    AND NOT EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.external_id = r.external_id
        AND j.source_provider = r.source_provider
    )
    ORDER BY r.source_provider, r.created_at DESC
  `);

    console.log(`Found ${recoverable.rows.length} recoverable jobs\n`);

    if (recoverable.rows.length === 0) {
        console.log('✅ No jobs to recover — all previously rejected jobs are now in the accepted DB.');
        client.release();
        await pool.end();
        return;
    }

    let recovered = 0;
    let skipped = 0;
    let errored = 0;
    const skippedReasons: Record<string, number> = {};

    for (const row of recoverable.rows) {
        const rawData = row.raw_data;
        const source = row.source_provider;

        // Extract fields from raw_data (which has the original fetched data)
        const title = rawData?.title || row.title;
        const employer = rawData?.company || row.employer || 'Company Not Listed';
        const location = rawData?.location || row.location || 'United States';
        const description = rawData?.description || '';
        const applyLink = rawData?.applyLink || row.apply_link;
        const externalId = rawData?.externalId || row.external_id;
        const postedDate = rawData?.postedDate;

        // Basic validation
        if (!title || !applyLink) {
            skipped++;
            skippedReasons['missing_title_or_link'] = (skippedReasons['missing_title_or_link'] || 0) + 1;
            continue;
        }

        // Check if external_id already exists (double-check with apply_link too)
        const existing = await client.query(`
      SELECT id FROM jobs 
      WHERE (external_id = $1 AND source_provider = $2)
         OR (apply_link = $3 AND is_published = true)
      LIMIT 1
    `, [externalId, source, applyLink]);

        if (existing.rows.length > 0) {
            skipped++;
            skippedReasons['already_exists'] = (skippedReasons['already_exists'] || 0) + 1;
            continue;
        }

        if (isDryRun) {
            console.log(`  ✅ WOULD RECOVER: [${source}] "${title}" — ${employer} (${location})`);
            recovered++;
            continue;
        }

        // Insert the job
        try {
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days
            const originalPostedAt = postedDate ? new Date(postedDate) : now;

            const insertResult = await client.query(`
        INSERT INTO jobs (
          id, title, employer, location, description, description_summary,
          apply_link, external_id, source_provider, source_type,
          is_published, is_featured, is_verified_employer, apply_on_platform,
          original_posted_at, expires_at, created_at, updated_at,
          quality_score, view_count, apply_click_count
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5,
          $6, $7, $8, 'external',
          true, false, false, false,
          $9, $10, NOW(), NOW(),
          0, 0, 0
        )
        RETURNING id
      `, [
                title,
                employer,
                location,
                description,
                description.slice(0, 300) + (description.length > 300 ? '...' : ''),
                applyLink,
                externalId,
                source,
                originalPostedAt,
                expiresAt,
            ]);

            const jobId = insertResult.rows[0].id;

            // Generate and update slug
            const slug = generateSlug(title, jobId);
            await client.query(`UPDATE jobs SET slug = $1 WHERE id = $2`, [slug, jobId]);

            console.log(`  ✅ RECOVERED: [${source}] "${title}" — ${employer} (ID: ${jobId})`);
            recovered++;
        } catch (err: any) {
            console.error(`  ❌ ERROR: [${source}] "${title}" — ${err.message}`);
            errored++;
        }
    }

    // Summary
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  RECOVERY SUMMARY ${isDryRun ? '(DRY RUN)' : ''}`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`  Total recoverable:  ${recoverable.rows.length}`);
    console.log(`  Recovered:          ${recovered}`);
    console.log(`  Skipped:            ${skipped}`);
    if (Object.keys(skippedReasons).length > 0) {
        for (const [reason, count] of Object.entries(skippedReasons)) {
            console.log(`    - ${reason}: ${count}`);
        }
    }
    console.log(`  Errors:             ${errored}`);
    console.log(`${'═'.repeat(60)}`);

    if (isDryRun) {
        console.log(`\n💡 Run without --dry-run to actually insert these jobs.`);
    }

    client.release();
    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
