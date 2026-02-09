/**
 * Purge irrelevant jobs from Production DB
 * Removes jobs whose titles don't contain any PMHNP-related keywords.
 */
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: 'postgresql://postgres.sggccmqjzuimwlahocmy:oWTJ14PgJiEenXTf@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
});

async function purge() {
    console.log('🧹 PRODUCTION DB - PURGE IRRELEVANT JOBS');
    console.log('=========================================\n');

    const client = await pool.connect();
    try {
        // Count before
        const beforeRes = await client.query(`SELECT COUNT(*) as count FROM jobs WHERE is_published = true`);
        console.log(`Published jobs BEFORE purge: ${beforeRes.rows[0].count}`);

        // Unpublish jobs without PMHNP-related keywords in title
        const purgeRes = await client.query(`
      UPDATE jobs SET is_published = false, updated_at = NOW()
      WHERE is_published = true
        AND LOWER(title) NOT LIKE '%pmhnp%'
        AND LOWER(title) NOT LIKE '%psychiatric nurse%'
        AND LOWER(title) NOT LIKE '%psychiatric mental health%'
        AND LOWER(title) NOT LIKE '%psych np%'
        AND LOWER(title) NOT LIKE '%psychiatric aprn%'
        AND LOWER(title) NOT LIKE '%psychiatric arnp%'
        AND LOWER(title) NOT LIKE '%mental health np%'
        AND LOWER(title) NOT LIKE '%psychiatry nurse practitioner%'
        AND LOWER(title) NOT LIKE '%psychiatric prescriber%'
        AND LOWER(title) NOT LIKE '%telepsychiatry%'
        AND LOWER(title) NOT LIKE '%behavioral health nurse practitioner%'
        AND LOWER(title) NOT LIKE '%psych nurse practitioner%'
    `);
        console.log(`❌ Unpublished irrelevant: ${purgeRes.rowCount}`);

        // Unpublish expired jobs
        const expiredRes = await client.query(`
      UPDATE jobs SET is_published = false, updated_at = NOW()
      WHERE is_published = true AND expires_at IS NOT NULL AND expires_at < NOW()
    `);
        console.log(`⏰ Unpublished expired: ${expiredRes.rowCount}`);

        // Unpublish stale jobs (>90 days)
        const staleRes = await client.query(`
      UPDATE jobs SET is_published = false, updated_at = NOW()
      WHERE is_published = true AND created_at < NOW() - INTERVAL '90 days'
    `);
        console.log(`🕐 Unpublished stale (>90 days): ${staleRes.rowCount}`);

        // Count after
        const afterRes = await client.query(`SELECT COUNT(*) as count FROM jobs WHERE is_published = true`);
        console.log(`\n✅ Published jobs AFTER purge: ${afterRes.rows[0].count}`);

        // Source breakdown after
        const sourceRes = await client.query(`
      SELECT source_provider, COUNT(*) as count
      FROM jobs WHERE is_published = true
      GROUP BY source_provider ORDER BY count DESC
    `);
        console.log('\n📦 REMAINING JOBS BY SOURCE:');
        for (const row of sourceRes.rows) {
            console.log(`  ${row.source_provider || 'unknown'}: ${row.count}`);
        }

        console.log('\n✅ Production cleanup complete.');
    } finally {
        client.release();
        await pool.end();
    }
    process.exit(0);
}

purge().catch(console.error);
