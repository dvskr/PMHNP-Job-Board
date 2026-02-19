require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

async function main() {
    // Verify we're on prod
    const dbInfo = await pool.query("SELECT current_database() as db");
    console.log('Connected to database:', dbInfo.rows[0].db);

    // Total ATS jobs now
    const ats = await pool.query(`
    SELECT COUNT(*)::int as total FROM jobs 
    WHERE is_published = true AND source_provider IN ('greenhouse','lever','ashby')
  `);
    console.log('Total ATS jobs (prod):', ats.rows[0].total);

    // Jobs created in last 1 hour (from our migration)
    const recent = await pool.query(`
    SELECT COUNT(*)::int as total FROM jobs 
    WHERE created_at >= NOW() - INTERVAL '1 hour'
  `);
    console.log('Jobs created in last hour:', recent.rows[0].total);

    // Sample of recently migrated
    const samples = await pool.query(`
    SELECT title, employer, source_provider, created_at 
    FROM jobs 
    WHERE created_at >= NOW() - INTERVAL '1 hour' 
    ORDER BY created_at DESC LIMIT 10
  `);
    console.log('\nRecently migrated jobs:');
    samples.rows.forEach(j => {
        console.log(`  [${j.source_provider}] "${j.title}" @ ${j.employer} (${j.created_at.toISOString()})`);
    });

    // Remaining rejected
    const rejected = await pool.query("SELECT COUNT(*)::int as total FROM rejected_jobs");
    console.log('\nRemaining rejected_jobs:', rejected.rows[0].total);

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
