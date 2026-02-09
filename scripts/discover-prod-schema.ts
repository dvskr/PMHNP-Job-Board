/**
 * Quick schema discovery for production DB
 */
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: 'postgresql://postgres.sggccmqjzuimwlahocmy:oWTJ14PgJiEenXTf@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
});

async function discover() {
    const client = await pool.connect();
    try {
        // List all tables
        const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `);
        console.log('📋 TABLES IN PROD DB:');
        for (const row of tables.rows) {
            console.log(`  ${row.table_name}`);
        }

        // Try to find job-related tables
        const jobTables = tables.rows.filter((r: any) =>
            r.table_name.toLowerCase().includes('job')
        );
        if (jobTables.length > 0) {
            console.log('\n🔍 JOB-RELATED TABLES:');
            for (const t of jobTables) {
                const countRes = await client.query(`SELECT COUNT(*) as count FROM "${t.table_name}"`);
                console.log(`  ${t.table_name}: ${countRes.rows[0].count} rows`);

                // Show columns
                const cols = await client.query(`
          SELECT column_name, data_type FROM information_schema.columns
          WHERE table_name = $1 AND table_schema = 'public'
          ORDER BY ordinal_position
        `, [t.table_name]);
                for (const col of cols.rows) {
                    console.log(`    - ${col.column_name} (${col.data_type})`);
                }
            }
        }
    } finally {
        client.release();
        await pool.end();
    }
    process.exit(0);
}

discover().catch(console.error);
