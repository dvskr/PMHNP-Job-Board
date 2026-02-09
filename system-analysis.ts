import 'dotenv/config';
import { Client } from 'pg';

async function analyzeSystem() {
    const client = new Client({
        connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL
    });

    await client.connect();

    console.log('=== SYSTEM GAP ANALYSIS ===\n');

    // 1. Source Distribution
    const sources = await client.query(`
    SELECT source_provider, count(*), 
           count(*) FILTER (WHERE original_posted_at IS NULL) as missing_dates,
           min(original_posted_at) as oldest_post,
           max(original_posted_at) as newest_post
    FROM jobs 
    WHERE is_published = true
    GROUP BY source_provider
  `);
    console.table(sources.rows);

    // 2. Date Anomalies
    const dateGaps = await client.query(`
    SELECT count(*) as count,
           avg(EXTRACT(DAY FROM (created_at - original_posted_at))) as avg_gap_days
    FROM jobs 
    WHERE original_posted_at IS NOT NULL
  `);
    console.log('\nDate Gaps (Discovery vs Posting):', dateGaps.rows[0]);

    // 3. Stale "Active" Jobs (posted > 90 days ago but still published)
    const staleJobs = await client.query(`
    SELECT count(*) 
    FROM jobs 
    WHERE is_published = true 
    AND original_posted_at < (NOW() - INTERVAL '90 days')
  `);
    console.log('\nStale Active Jobs (>90 days old):', staleJobs.rows[0].count);

    // 4. Missing Critical Fields
    const missingFields = await client.query(`
    SELECT 
      count(*) FILTER (WHERE min_salary IS NULL AND max_salary IS NULL) as missing_salary,
      count(*) FILTER (WHERE description IS NULL OR length(description) < 100) as thin_content,
      count(*) FILTER (WHERE job_type IS NULL) as missing_type,
      count(*) FILTER (WHERE location LIKE '%Unknown%') as bad_location
    FROM jobs
    WHERE is_published = true
  `);
    console.log('\nData Quality Issues:', missingFields.rows[0]);

    // 5. Duplication Risk (Same Title + Employer)
    const potentialDupes = await client.query(`
    SELECT title, employer, count(*) 
    FROM jobs 
    WHERE is_published = true
    GROUP BY title, employer 
    HAVING count(*) > 1
    ORDER BY count(*) DESC
    LIMIT 5
  `);
    console.log('\nTop Potential Duplicates (Title + Employer):');
    potentialDupes.rows.forEach(r => console.log(`  ${r.count}x: ${r.title} @ ${r.employer}`));

    await client.end();
}

analyzeSystem().catch(console.error);
