require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

async function main() {
    // 1. Overall salary coverage
    const total = await pool.query("SELECT COUNT(*)::int as total FROM jobs WHERE is_published = true");
    const withSalary = await pool.query("SELECT COUNT(*)::int as total FROM jobs WHERE is_published = true AND (min_salary IS NOT NULL OR display_salary IS NOT NULL)");
    const withoutSalary = await pool.query("SELECT COUNT(*)::int as total FROM jobs WHERE is_published = true AND min_salary IS NULL AND display_salary IS NULL");

    console.log('=== SALARY COVERAGE ===');
    console.log(`Total published: ${total.rows[0].total}`);
    console.log(`With salary:     ${withSalary.rows[0].total} (${(withSalary.rows[0].total / total.rows[0].total * 100).toFixed(1)}%)`);
    console.log(`Without salary:  ${withoutSalary.rows[0].total} (${(withoutSalary.rows[0].total / total.rows[0].total * 100).toFixed(1)}%)`);

    // 2. Salary coverage by source
    const bySource = await pool.query(`
    SELECT source_provider,
      COUNT(*)::int as total,
      COUNT(CASE WHEN min_salary IS NOT NULL THEN 1 END)::int as with_salary,
      COUNT(CASE WHEN min_salary IS NULL AND display_salary IS NULL THEN 1 END)::int as without_salary
    FROM jobs WHERE is_published = true
    GROUP BY source_provider
    ORDER BY total DESC
  `);
    console.log('\n--- By Source ---');
    bySource.rows.forEach(r => {
        const pct = r.total > 0 ? (r.with_salary / r.total * 100).toFixed(0) : '0';
        console.log(`  ${(r.source_provider || 'employer').padEnd(15)} ${String(r.total).padStart(4)} total | ${String(r.with_salary).padStart(4)} with salary (${pct}%) | ${r.without_salary} missing`);
    });

    // 3. Sample jobs without salary - check if description contains $ amounts
    const noSalary = await pool.query(`
    SELECT id, title, employer, source_provider, 
      CASE WHEN description LIKE '%$%' THEN true ELSE false END as has_dollar_in_desc,
      SUBSTRING(description FROM '\\$[0-9,]+') as found_amount
    FROM jobs 
    WHERE is_published = true AND min_salary IS NULL AND display_salary IS NULL
    ORDER BY created_at DESC
    LIMIT 20
  `);
    console.log('\n--- Sample Jobs Missing Salary (has $ in description?) ---');
    noSalary.rows.forEach(r => {
        console.log(`  [${r.source_provider || 'employer'}] "${r.title}" @ ${r.employer} → $in desc: ${r.has_dollar_in_desc} ${r.found_amount || ''}`);
    });

    // 4. Count how many no-salary jobs have $ in description
    const recoverable = await pool.query(`
    SELECT COUNT(*)::int as total FROM jobs 
    WHERE is_published = true AND min_salary IS NULL AND display_salary IS NULL
    AND description LIKE '%$%'
  `);
    console.log(`\nRecoverable (have $ in description): ${recoverable.rows[0].total}`);

    // 5. Active job filtering - check expiration dates
    const expired = await pool.query(`
    SELECT COUNT(*)::int as total FROM jobs 
    WHERE is_published = true AND expires_at < NOW()
  `);
    const noExpiry = await pool.query(`
    SELECT COUNT(*)::int as total FROM jobs 
    WHERE is_published = true AND expires_at IS NULL
  `);
    const staleJobs = await pool.query(`
    SELECT COUNT(*)::int as total FROM jobs 
    WHERE is_published = true AND original_posted_at < NOW() - INTERVAL '180 days'
  `);

    console.log('\n=== ACTIVE JOB FILTERING ===');
    console.log(`Published but expired:  ${expired.rows[0].total}`);
    console.log(`Published, no expiry:   ${noExpiry.rows[0].total}`);
    console.log(`Published, >180d stale: ${staleJobs.rows[0].total}`);

    // 6. Jobs by age  
    const ageDist = await pool.query(`
    SELECT 
      COUNT(CASE WHEN original_posted_at >= NOW() - INTERVAL '7 days' THEN 1 END)::int as last_7d,
      COUNT(CASE WHEN original_posted_at >= NOW() - INTERVAL '30 days' AND original_posted_at < NOW() - INTERVAL '7 days' THEN 1 END)::int as "7d_to_30d",
      COUNT(CASE WHEN original_posted_at >= NOW() - INTERVAL '90 days' AND original_posted_at < NOW() - INTERVAL '30 days' THEN 1 END)::int as "30d_to_90d",
      COUNT(CASE WHEN original_posted_at >= NOW() - INTERVAL '180 days' AND original_posted_at < NOW() - INTERVAL '90 days' THEN 1 END)::int as "90d_to_180d",
      COUNT(CASE WHEN original_posted_at < NOW() - INTERVAL '180 days' THEN 1 END)::int as older_180d,
      COUNT(CASE WHEN original_posted_at IS NULL THEN 1 END)::int as no_date
    FROM jobs WHERE is_published = true
  `);
    console.log('\n--- Published Jobs Age Distribution ---');
    const a = ageDist.rows[0];
    console.log(`  Last 7 days:   ${a.last_7d}`);
    console.log(`  7-30 days:     ${a['7d_to_30d']}`);
    console.log(`  30-90 days:    ${a['30d_to_90d']}`);
    console.log(`  90-180 days:   ${a['90d_to_180d']}`);
    console.log(`  >180 days:     ${a.older_180d}`);
    console.log(`  No date:       ${a.no_date}`);

    // 7. Duplicate check
    const dupes = await pool.query(`
    SELECT title, employer, COUNT(*)::int as count
    FROM jobs WHERE is_published = true
    GROUP BY title, employer
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 10
  `);
    console.log('\n=== DUPLICATE CHECK (same title+employer) ===');
    dupes.rows.forEach(r => console.log(`  "${r.title}" @ ${r.employer} → ${r.count}x`));

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
