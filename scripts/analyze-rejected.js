require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

async function main() {
  // Check age distribution of rejected jobs
  const ageDist = await pool.query(`
    SELECT 
      source_provider,
      COUNT(*)::int as total,
      COUNT(CASE WHEN (raw_data->>'postedDate')::timestamp < NOW() - INTERVAL '365 days' THEN 1 END)::int as older_1yr,
      COUNT(CASE WHEN (raw_data->>'postedDate')::timestamp >= NOW() - INTERVAL '365 days' 
                  AND (raw_data->>'postedDate')::timestamp < NOW() - INTERVAL '180 days' THEN 1 END)::int as "6mo_to_1yr",
      COUNT(CASE WHEN (raw_data->>'postedDate')::timestamp >= NOW() - INTERVAL '180 days'
                  AND (raw_data->>'postedDate')::timestamp < NOW() - INTERVAL '90 days' THEN 1 END)::int as "3mo_to_6mo",
      COUNT(CASE WHEN (raw_data->>'postedDate')::timestamp >= NOW() - INTERVAL '90 days' THEN 1 END)::int as under_90d
    FROM rejected_jobs
    WHERE raw_data->>'postedDate' IS NOT NULL
    GROUP BY source_provider
  `);

  console.log('=== AGE DISTRIBUTION OF REJECTED JOBS ===\n');
  console.log('Source          | Total | >1yr | 6mo-1yr | 3mo-6mo | <90d');
  console.log('----------------|-------|------|---------|---------|-----');
  ageDist.rows.forEach(r => {
    console.log(`${r.source_provider.padEnd(16)}| ${String(r.total).padStart(5)} | ${String(r.older_1yr).padStart(4)} | ${String(r['6mo_to_1yr']).padStart(7)} | ${String(r['3mo_to_6mo']).padStart(7)} | ${String(r.under_90d).padStart(4)}`);
  });

  // Check if these "stale" jobs are STILL LIVE on greenhouse
  const ghSample = await pool.query(`
    SELECT raw_data->>'applyLink' as url, title, employer, raw_data->>'postedDate' as posted
    FROM rejected_jobs
    WHERE source_provider = 'greenhouse'
      AND title ILIKE '%pmhnp%'
    ORDER BY created_at DESC
    LIMIT 5
  `);

  console.log('\n\n=== SPOT-CHECK: Are these Greenhouse jobs still live? ===');
  for (const r of ghSample.rows) {
    console.log(`\n"${r.title}" @ ${r.employer}`);
    console.log(`  Posted: ${r.posted}`);
    console.log(`  URL: ${r.url}`);

    try {
      const res = await fetch(r.url, { method: 'HEAD', redirect: 'follow' });
      console.log(`  HTTP: ${res.status} (${res.status === 200 ? 'STILL LIVE' : res.status === 404 ? 'GONE' : 'UNKNOWN'})`);
    } catch (e) {
      console.log(`  HTTP: ERROR - ${e.message}`);
    }
  }

  // Check total PMHNP equivalent in accepted jobs
  const acceptedPMHNP = await pool.query(`
    SELECT COUNT(*)::int as count FROM jobs
    WHERE is_published = true
      AND source_provider IN ('greenhouse', 'lever', 'ashby')
  `);
  console.log(`\n\n=== Current accepted PMHNP from ATS sources: ${acceptedPMHNP.rows[0].count} ===`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
