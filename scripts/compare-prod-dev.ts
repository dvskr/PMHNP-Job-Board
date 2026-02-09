/**
 * Compare prod vs dev databases using raw pg for BOTH.
 */
import { Pool } from 'pg';

const devPool = new Pool({
    connectionString: 'postgresql://postgres:6174jirayasensei@db.zdmpmncrcpgpmwdqvekg.supabase.co:6543/postgres?pgbouncer=true',
});

const prodPool = new Pool({
    connectionString: 'postgresql://postgres.sggccmqjzuimwlahocmy:oWTJ14PgJiEenXTf@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
});

async function compare() {
    console.log('🔄 PROD vs DEV - CORRECTED OVERLAP CHECK');
    console.log('=========================================\n');

    const devClient = await devPool.connect();
    const prodClient = await prodPool.connect();

    try {
        // Check table names in dev
        const devTables = await devClient.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%job%'`);
        console.log('Dev job tables:', devTables.rows.map(r => r.table_name).join(', '));
        const prodTables = await prodClient.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%job%'`);
        console.log('Prod job tables:', prodTables.rows.map(r => r.table_name).join(', '));

        // Dev: check if table is "Job" or "jobs"
        let devTable = 'Job';
        try {
            await devClient.query(`SELECT COUNT(*) FROM "Job"`);
        } catch {
            devTable = 'jobs';
        }
        console.log(`\nUsing dev table: "${devTable}"`);

        // Get dev jobs
        const devRes = await devClient.query(`
      SELECT external_id, title, employer, source_provider
      FROM jobs WHERE is_published = true
    `);
        console.log(`📦 Dev published: ${devRes.rows.length}`);

        // Get prod jobs
        const prodRes = await prodClient.query(`
      SELECT external_id, title, employer, source_provider
      FROM jobs WHERE is_published = true
    `);
        console.log(`📦 Prod published: ${prodRes.rows.length}`);

        // Build sets
        const devIds = new Set(devRes.rows.filter(j => j.external_id).map(j => j.external_id));
        const prodIds = new Set(prodRes.rows.filter(j => j.external_id).map(j => j.external_id));

        let shared = 0;
        for (const id of devIds) { if (prodIds.has(id)) shared++; }

        let devOnly = 0;
        const devOnlyBySource = new Map<string, number>();
        for (const job of devRes.rows) {
            if (job.external_id && !prodIds.has(job.external_id)) {
                devOnly++;
                const src = job.source_provider || 'unknown';
                devOnlyBySource.set(src, (devOnlyBySource.get(src) || 0) + 1);
            }
        }

        let prodOnly = 0;
        const prodOnlyBySource = new Map<string, number>();
        for (const job of prodRes.rows) {
            if (job.external_id && !devIds.has(job.external_id)) {
                prodOnly++;
                const src = job.source_provider || 'unknown';
                prodOnlyBySource.set(src, (prodOnlyBySource.get(src) || 0) + 1);
            }
        }


        console.log('\n🔄 OVERLAP:');
        console.log('─────────────────────────────');
        console.log(`  Shared (by externalId): ${shared}`);
        console.log(`  Dev-only:               ${devOnly}`);
        console.log(`  Prod-only:              ${prodOnly}`);

        if (devOnlyBySource.size > 0) {
            console.log('\n  Dev-only by source:');
            for (const [s, c] of [...devOnlyBySource.entries()].sort((a, b) => b[1] - a[1])) {
                console.log(`    ${s}: ${c}`);
            }
        }
        if (prodOnlyBySource.size > 0) {
            console.log('\n  Prod-only by source:');
            for (const [s, c] of [...prodOnlyBySource.entries()].sort((a, b) => b[1] - a[1])) {
                console.log(`    ${s}: ${c}`);
            }
        }

        console.log('\n✅ Comparison complete.');
    } finally {
        devClient.release();
        prodClient.release();
        await devPool.end();
        await prodPool.end();
    }
    process.exit(0);
}

compare().catch(console.error);
