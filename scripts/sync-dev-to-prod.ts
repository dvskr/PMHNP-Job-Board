/**
 * Sync dev-only jobs to prod database.
 * Copies published jobs from dev that don't exist in prod (by external_id).
 */
import 'dotenv/config';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL || !process.env.PROD_DATABASE_URL) {
    console.error('❌ DATABASE_URL and PROD_DATABASE_URL must be set in .env');
    process.exit(1);
}

const devPool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const prodPool = new Pool({
    connectionString: process.env.PROD_DATABASE_URL,
});

async function sync() {
    console.log('🔄 SYNCING DEV → PROD');
    console.log('======================\n');

    const devClient = await devPool.connect();
    const prodClient = await prodPool.connect();

    try {
        // Get all column names from prod to know what to copy
        const colRes = await prodClient.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'jobs' AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
        const allColumns = colRes.rows.map((r: any) => r.column_name);
        console.log(`Prod columns: ${allColumns.length} → ${allColumns.join(', ')}`);

        // Get prod external_ids
        const prodIdsRes = await prodClient.query(`SELECT external_id FROM jobs WHERE external_id IS NOT NULL`);
        const prodIds = new Set(prodIdsRes.rows.map((r: any) => r.external_id));
        console.log(`Prod existing external_ids: ${prodIds.size}`);

        // Get dev-only published jobs (columns that exist in both schemas)
        const devRes = await devClient.query(`SELECT * FROM jobs WHERE is_published = true`);
        console.log(`Dev published jobs: ${devRes.rows.length}`);

        // Filter to dev-only
        const devOnly = devRes.rows.filter((j: any) => j.external_id && !prodIds.has(j.external_id));
        console.log(`Dev-only jobs to sync: ${devOnly.length}\n`);

        if (devOnly.length === 0) {
            console.log('Nothing to sync!');
            return;
        }

        // Get shared columns between dev and prod
        const devColRes = await devClient.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'jobs' AND table_schema = 'public'
    `);
        const devColumns = new Set(devColRes.rows.map((r: any) => r.column_name));
        const sharedColumns = allColumns.filter(c => devColumns.has(c));
        console.log(`Shared columns: ${sharedColumns.length}`);

        // Insert in batches of 50
        let inserted = 0;
        let errors = 0;
        const BATCH = 50;

        for (let i = 0; i < devOnly.length; i += BATCH) {
            const batch = devOnly.slice(i, i + BATCH);

            for (const job of batch) {
                try {
                    const values = sharedColumns.map(col => job[col]);
                    const placeholders = sharedColumns.map((_, idx) => `$${idx + 1}`);
                    const colNames = sharedColumns.map(c => `"${c}"`);

                    await prodClient.query(
                        `INSERT INTO jobs (${colNames.join(', ')}) VALUES (${placeholders.join(', ')})
             ON CONFLICT (id) DO NOTHING`,
                        values
                    );
                    inserted++;
                } catch (err: any) {
                    errors++;
                    if (errors <= 5) {
                        console.error(`  Error inserting "${job.title}":`, err.message);
                    }
                }
            }

            if ((i + BATCH) % 200 === 0 || i + BATCH >= devOnly.length) {
                console.log(`  Progress: ${Math.min(i + BATCH, devOnly.length)}/${devOnly.length} (inserted: ${inserted}, errors: ${errors})`);
            }
        }

        // Final count
        const afterRes = await prodClient.query(`SELECT COUNT(*) as count FROM jobs WHERE is_published = true`);

        console.log('\n✅ SYNC COMPLETE');
        console.log('─────────────────────────────');
        console.log(`  Inserted: ${inserted}`);
        console.log(`  Errors:   ${errors}`);
        console.log(`  Prod published now: ${afterRes.rows[0].count}`);
    } finally {
        devClient.release();
        prodClient.release();
        await devPool.end();
        await prodPool.end();
    }
    process.exit(0);
}

sync().catch(console.error);
