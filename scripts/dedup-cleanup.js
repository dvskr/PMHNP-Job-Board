/**
 * Dedup cleanup: remove true duplicate jobs (same title + employer + city + state)
 * Keeps the newest entry for each group.
 * 
 * Usage: node scripts/dedup-cleanup.js [--apply]
 */
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

const dryRun = !process.argv.includes('--apply');

async function main() {
    console.log(`=== Dedup Cleanup ${dryRun ? '(DRY RUN)' : '(APPLYING)'} ===\n`);

    // Find true duplicates and get IDs to remove (keep the newest)
    const dupes = await pool.query(`
    WITH ranked AS (
      SELECT id, title, employer, city, state,
        ROW_NUMBER() OVER (
          PARTITION BY title, employer, COALESCE(city, ''), COALESCE(state, '')
          ORDER BY created_at DESC
        ) as rn
      FROM jobs
      WHERE is_published = true
    )
    SELECT id, title, employer, city, state
    FROM ranked
    WHERE rn > 1
    ORDER BY title, employer
  `);

    console.log(`Found ${dupes.rows.length} duplicate entries to remove\n`);

    if (dupes.rows.length === 0) {
        console.log('No duplicates found!');
        await pool.end();
        return;
    }

    // Show what will be removed
    for (const d of dupes.rows.slice(0, 20)) {
        console.log(`  ❌ "${d.title}" @ ${d.employer} in ${d.city || 'null'}, ${d.state || 'null'}`);
    }
    if (dupes.rows.length > 20) {
        console.log(`  ... and ${dupes.rows.length - 20} more`);
    }

    if (!dryRun) {
        const ids = dupes.rows.map(d => d.id);
        // Unpublish instead of delete (safer)
        const result = await pool.query(
            `UPDATE jobs SET is_published = false WHERE id = ANY($1::text[])`,
            [ids]
        );
        console.log(`\nUnpublished ${result.rowCount} duplicate entries`);
    } else {
        console.log(`\nRun with --apply to unpublish duplicates`);
    }

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
