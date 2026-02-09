/**
 * Step 1: Sync companies from dev → prod
 * Step 2: Re-sync the 1,675 failed jobs
 */
import { Pool } from 'pg';

const devPool = new Pool({
    connectionString: 'postgresql://postgres:6174jirayasensei@db.zdmpmncrcpgpmwdqvekg.supabase.co:6543/postgres?pgbouncer=true',
});

const prodPool = new Pool({
    connectionString: 'postgresql://postgres.sggccmqjzuimwlahocmy:oWTJ14PgJiEenXTf@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
});

async function sync() {
    console.log('🏢 STEP 1: SYNCING COMPANIES DEV → PROD');
    console.log('========================================\n');

    const devClient = await devPool.connect();
    const prodClient = await prodPool.connect();

    try {
        // Get company columns
        const colRes = await prodClient.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'companies' AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
        const prodCols = colRes.rows.map((r: any) => r.column_name);
        console.log(`Company columns: ${prodCols.join(', ')}`);

        // Get existing prod company ids
        const prodCompRes = await prodClient.query(`SELECT id FROM companies`);
        const prodCompIds = new Set(prodCompRes.rows.map((r: any) => r.id));
        console.log(`Prod companies: ${prodCompIds.size}`);

        // Get dev companies
        const devCompRes = await devClient.query(`SELECT * FROM companies`);
        console.log(`Dev companies: ${devCompRes.rows.length}`);

        // Filter dev-only companies
        const devOnly = devCompRes.rows.filter((c: any) => !prodCompIds.has(c.id));
        console.log(`Companies to sync: ${devOnly.length}\n`);

        // Get shared columns
        const devColRes = await devClient.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'companies' AND table_schema = 'public'
    `);
        const devCols = new Set(devColRes.rows.map((r: any) => r.column_name));
        const sharedCols = prodCols.filter(c => devCols.has(c));

        // Insert companies
        let compInserted = 0;
        let compErrors = 0;
        for (const comp of devOnly) {
            try {
                const values = sharedCols.map(col => comp[col]);
                const placeholders = sharedCols.map((_, idx) => `$${idx + 1}`);
                const colNames = sharedCols.map(c => `"${c}"`);

                await prodClient.query(
                    `INSERT INTO companies (${colNames.join(', ')}) VALUES (${placeholders.join(', ')})
           ON CONFLICT (id) DO NOTHING`,
                    values
                );
                compInserted++;
            } catch (err: any) {
                compErrors++;
                if (compErrors <= 3) console.error(`  Company error:`, err.message);
            }
        }
        console.log(`✅ Companies inserted: ${compInserted}, errors: ${compErrors}`);

        // STEP 2: Re-sync failed jobs
        console.log('\n\n📋 STEP 2: RE-SYNCING FAILED JOBS');
        console.log('==================================\n');

        // Get all prod job external_ids
        const prodIdsRes = await prodClient.query(`SELECT external_id FROM jobs WHERE external_id IS NOT NULL`);
        const prodIds = new Set(prodIdsRes.rows.map((r: any) => r.external_id));
        console.log(`Prod existing jobs: ${prodIds.size}`);

        // Get dev published jobs that aren't in prod
        const devRes = await devClient.query(`SELECT * FROM jobs WHERE is_published = true`);
        const remaining = devRes.rows.filter((j: any) => j.external_id && !prodIds.has(j.external_id));
        console.log(`Remaining jobs to sync: ${remaining.length}\n`);

        // Get shared job columns
        const jobColRes = await prodClient.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'jobs' AND table_schema = 'public'
    `);
        const allJobCols = jobColRes.rows.map((r: any) => r.column_name);
        const devJobColRes = await devClient.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'jobs' AND table_schema = 'public'
    `);
        const devJobCols = new Set(devJobColRes.rows.map((r: any) => r.column_name));
        const sharedJobCols = allJobCols.filter((c: string) => devJobCols.has(c));

        let inserted = 0;
        let errors = 0;

        for (let i = 0; i < remaining.length; i++) {
            const job = remaining[i];
            try {
                const values = sharedJobCols.map((col: string) => job[col]);
                const placeholders = sharedJobCols.map((_: string, idx: number) => `$${idx + 1}`);
                const colNames = sharedJobCols.map((c: string) => `"${c}"`);

                await prodClient.query(
                    `INSERT INTO jobs (${colNames.join(', ')}) VALUES (${placeholders.join(', ')})
           ON CONFLICT (id) DO NOTHING`,
                    values
                );
                inserted++;
            } catch (err: any) {
                errors++;
                if (errors <= 5) console.error(`  Job error: ${err.message.substring(0, 100)}`);
            }

            if ((i + 1) % 200 === 0 || i + 1 === remaining.length) {
                console.log(`  Progress: ${i + 1}/${remaining.length} (inserted: ${inserted}, errors: ${errors})`);
            }
        }

        // Final count
        const finalRes = await prodClient.query(`SELECT COUNT(*) as count FROM jobs WHERE is_published = true`);

        console.log('\n✅ FULL SYNC COMPLETE');
        console.log('─────────────────────────────');
        console.log(`  Companies added: ${compInserted}`);
        console.log(`  Jobs added:      ${inserted}`);
        console.log(`  Job errors:      ${errors}`);
        console.log(`  Prod published:  ${finalRes.rows[0].count}`);
    } finally {
        devClient.release();
        prodClient.release();
        await devPool.end();
        await prodPool.end();
    }
    process.exit(0);
}

sync().catch(console.error);
