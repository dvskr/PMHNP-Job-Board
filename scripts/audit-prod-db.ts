/**
 * Production DB Job Quality Audit (snake_case schema)
 */
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: 'postgresql://postgres.sggccmqjzuimwlahocmy:oWTJ14PgJiEenXTf@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
});

async function audit() {
    console.log('🔍 PRODUCTION DB - JOB QUALITY AUDIT');
    console.log('=====================================\n');

    const client = await pool.connect();
    try {
        // Total
        const totalRes = await client.query(`SELECT COUNT(*) as count FROM jobs WHERE is_published = true`);
        console.log(`Total Published Jobs: ${totalRes.rows[0].count}\n`);

        // By source
        const sourceRes = await client.query(`
      SELECT source_provider, COUNT(*) as count
      FROM jobs WHERE is_published = true
      GROUP BY source_provider ORDER BY count DESC
    `);
        console.log('📦 JOBS BY SOURCE:');
        console.log('─────────────────────────────');
        for (const row of sourceRes.rows) {
            console.log(`  ${row.source_provider || 'unknown'}: ${row.count}`);
        }

        // Stale
        const staleRes = await client.query(`
      SELECT title, employer, source_provider,
        EXTRACT(DAY FROM NOW() - COALESCE(created_at, created_at)) as age_days
      FROM jobs
      WHERE is_published = true
        AND created_at < NOW() - INTERVAL '90 days'
      ORDER BY age_days DESC LIMIT 20
    `);
        console.log(`\n🕐 Stale Jobs (>90 days): ${staleRes.rows.length}`);
        for (const row of staleRes.rows) {
            console.log(`  [${row.source_provider}] "${row.title}" — ${Math.round(row.age_days)} days old`);
        }

        // Irrelevant titles
        const irrelevantRes = await client.query(`
      SELECT title, employer, source_provider FROM jobs
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
      ORDER BY created_at DESC LIMIT 50
    `);
        const irrelevantCountRes = await client.query(`
      SELECT COUNT(*) as count FROM jobs
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
        const irrCount = parseInt(irrelevantCountRes.rows[0].count);
        console.log(`\n🚨 Irrelevant Titles: ${irrCount}`);
        if (irrelevantRes.rows.length > 0) {
            console.log('─────────────────────────────');
            for (const row of irrelevantRes.rows) {
                console.log(`  [${row.source_provider}] "${row.title}" — ${row.employer}`);
            }
            if (irrCount > 50) console.log(`  ... and ${irrCount - 50} more`);
        }

        // Field quality
        const fieldRes = await client.query(`
      SELECT
        SUM(CASE WHEN title IS NULL OR title = '' THEN 1 ELSE 0 END) as no_title,
        SUM(CASE WHEN employer IS NULL OR employer = '' THEN 1 ELSE 0 END) as no_employer,
        SUM(CASE WHEN apply_link IS NULL OR apply_link = '' THEN 1 ELSE 0 END) as no_link,
        SUM(CASE WHEN LENGTH(description) < 50 THEN 1 ELSE 0 END) as short_desc,
        SUM(CASE WHEN location IS NULL OR location = '' OR location = 'United States' THEN 1 ELSE 0 END) as no_location
      FROM jobs WHERE is_published = true
    `);
        const f = fieldRes.rows[0];
        console.log('\n📊 FIELD QUALITY:');
        console.log('─────────────────────────────');
        console.log(`  Missing Title:       ${f.no_title}`);
        console.log(`  Missing Employer:    ${f.no_employer}`);
        console.log(`  Missing Apply Link:  ${f.no_link}`);
        console.log(`  Short Description:   ${f.short_desc}`);
        console.log(`  No/Generic Location: ${f.no_location}`);

        // Expired
        const expiredRes = await client.query(`
      SELECT COUNT(*) as count FROM jobs
      WHERE is_published = true AND expires_at IS NOT NULL AND expires_at < NOW()
    `);
        console.log(`\n⏰ Expired but still published: ${expiredRes.rows[0].count}`);

        // Duplicate apply links
        const dupRes = await client.query(`
      SELECT apply_link, COUNT(*) as count FROM jobs
      WHERE is_published = true
      GROUP BY apply_link HAVING COUNT(*) > 1
      ORDER BY count DESC LIMIT 10
    `);
        let dupTotal = 0;
        for (const r of dupRes.rows) dupTotal += parseInt(r.count);
        console.log(`\n🔗 Duplicate Apply Links: ${dupTotal} jobs across ${dupRes.rows.length} URLs`);

        console.log('\n✅ Production audit complete.');
    } finally {
        client.release();
        await pool.end();
    }
    process.exit(0);
}

audit().catch(console.error);
