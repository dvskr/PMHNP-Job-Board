/**
 * Sync ALL jobs from PROD → DEV.
 * 1. Deletes all jobs from dev
 * 2. Copies all jobs from prod to dev
 * 
 * Usage: npx tsx scripts/sync-prod-to-dev.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL || !process.env.PROD_DATABASE_URL) {
    console.error('❌ DATABASE_URL (dev) and PROD_DATABASE_URL (prod) must be set in .env');
    process.exit(1);
}

const devPool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const prodPool = new Pool({
    connectionString: process.env.PROD_DATABASE_URL,
});

async function sync() {
    console.log('\n🔄 SYNCING PROD → DEV (Full Replace)');
    console.log('======================================\n');

    const devClient = await devPool.connect();
    const prodClient = await prodPool.connect();

    try {
        // Step 1: Get shared columns between prod and dev
        const prodColRes = await prodClient.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'jobs' AND table_schema = 'public'
            ORDER BY ordinal_position
        `);
        const prodColumns = prodColRes.rows.map((r: any) => r.column_name);

        const devColRes = await devClient.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'jobs' AND table_schema = 'public'
            ORDER BY ordinal_position
        `);
        const devColumns = new Set(devColRes.rows.map((r: any) => r.column_name));
        const sharedColumns = prodColumns.filter((c: string) => devColumns.has(c));
        console.log(`📋 Shared columns: ${sharedColumns.length}`);

        // Step 2: Count prod jobs
        const prodCountRes = await prodClient.query(`SELECT COUNT(*) as count FROM jobs`);
        const prodCount = parseInt(prodCountRes.rows[0].count, 10);
        console.log(`📊 Prod total jobs: ${prodCount}`);

        // Step 3: Wipe dev jobs
        console.log('\n🗑️  Deleting all jobs from dev...');
        // Delete related records first (foreign keys)
        await devClient.query(`DELETE FROM job_applications WHERE job_id IN (SELECT id FROM jobs)`).catch(() => { });
        await devClient.query(`DELETE FROM saved_jobs WHERE job_id IN (SELECT id FROM jobs)`).catch(() => { });
        const deleteRes = await devClient.query(`DELETE FROM jobs`);
        console.log(`   Deleted ${deleteRes.rowCount} dev jobs.\n`);

        // Step 4: Fetch all prod jobs
        console.log('📥 Fetching all prod jobs...');
        const prodJobs = await prodClient.query(`SELECT * FROM jobs`);
        console.log(`   Fetched ${prodJobs.rows.length} jobs.\n`);

        // Step 5: Insert into dev in batches
        console.log('📤 Inserting into dev...');
        let inserted = 0;
        let errors = 0;
        const BATCH = 100;

        for (let i = 0; i < prodJobs.rows.length; i += BATCH) {
            const batch = prodJobs.rows.slice(i, i + BATCH);

            for (const job of batch) {
                try {
                    const values = sharedColumns.map((col: string) => job[col]);
                    const placeholders = sharedColumns.map((_: string, idx: number) => `$${idx + 1}`);
                    const colNames = sharedColumns.map((c: string) => `"${c}"`);

                    await devClient.query(
                        `INSERT INTO jobs (${colNames.join(', ')}) VALUES (${placeholders.join(', ')})
                         ON CONFLICT (id) DO NOTHING`,
                        values
                    );
                    inserted++;
                } catch (err: any) {
                    errors++;
                    if (errors <= 5) {
                        console.error(`  ❌ Error inserting "${job.title}":`, err.message);
                    }
                }
            }

            const progress = Math.min(i + BATCH, prodJobs.rows.length);
            process.stdout.write(`\r   Progress: ${progress}/${prodJobs.rows.length} (inserted: ${inserted}, errors: ${errors})`);
        }

        // Final counts
        const afterRes = await devClient.query(`SELECT COUNT(*) as count FROM jobs`);
        const publishedRes = await devClient.query(`SELECT COUNT(*) as count FROM jobs WHERE is_published = true`);

        console.log('\n\n✅ SYNC COMPLETE');
        console.log('──────────────────────────────');
        console.log(`  Prod jobs:        ${prodCount}`);
        console.log(`  Inserted to dev:  ${inserted}`);
        console.log(`  Errors:           ${errors}`);
        console.log(`  Dev total now:    ${afterRes.rows[0].count}`);
        console.log(`  Dev published:    ${publishedRes.rows[0].count}\n`);
    } finally {
        devClient.release();
        prodClient.release();
        await devPool.end();
        await prodPool.end();
    }
    process.exit(0);
}

sync().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
