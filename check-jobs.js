require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

async function check() {
    // Find ALL employer posts from last 7 days, no filters
    const r1 = await pool.query(`
    SELECT title, employer, is_published, slug IS NOT NULL as has_slug,
           display_salary, created_at, expires_at, source_type
    FROM jobs
    WHERE source_type = 'employer'
    ORDER BY created_at DESC
    LIMIT 10
  `);
    console.log('=== ALL employer posts (last 10) ===');
    r1.rows.forEach((j, i) => {
        console.log(`${i + 1}. ${j.title} | ${j.employer}`);
        console.log(`   published: ${j.is_published} | slug: ${j.has_slug} | salary: ${j.display_salary || 'NULL'}`);
        console.log(`   created: ${j.created_at} | expires: ${j.expires_at || 'NULL'}`);
        console.log('');
    });

    // Count employer posts by time window
    const r2 = await pool.query(`
    SELECT 
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '48 hours') as last_48h,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7d,
      COUNT(*) as total
    FROM jobs WHERE source_type = 'employer'
  `);
    console.log('Employer post counts:', r2.rows[0]);

    await pool.end();
}
check().catch(e => { console.error(e.message); process.exit(1); });
