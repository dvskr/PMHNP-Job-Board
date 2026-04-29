import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.PROD_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Missing PROD_DATABASE_URL (or DATABASE_URL). Add it to .env.prod or your shell environment before running this script.');
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function main(): Promise<void> {
  console.log('\n═══ USER PROFILE BREAKDOWN ═══\n');

  // Role distribution
  const roles = await pool.query(`SELECT role, COUNT(*) as cnt FROM user_profiles GROUP BY role ORDER BY cnt DESC`);
  console.log('  Role Distribution:');
  for (const r of roles.rows) {
    console.log(`    ${String(r.role || 'NULL').padEnd(20)} ${r.cnt}`);
  }

  // Signups over time
  const monthly = await pool.query(`
    SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as cnt
    FROM user_profiles
    GROUP BY month
    ORDER BY month DESC
    LIMIT 6
  `);
  console.log('\n  Monthly Signups (last 6 months):');
  for (const r of monthly.rows) {
    console.log(`    ${r.month}   ${r.cnt}`);
  }

  // Profile completeness - check columns
  const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'user_profiles' ORDER BY ordinal_position`);
  console.log('\n  Profile Columns:');
  console.log(`    ${cols.rows.map((r: { column_name: string }) => r.column_name).join(', ')}`);

  const hasResume = await pool.query(`SELECT COUNT(*) FROM user_profiles WHERE resume_url IS NOT NULL`);
  const hasHeadline = await pool.query(`SELECT COUNT(*) FROM user_profiles WHERE headline IS NOT NULL AND headline != ''`);
  const hasBio = await pool.query(`SELECT COUNT(*) FROM user_profiles WHERE bio IS NOT NULL AND bio != ''`);

  console.log('\n  Profile Completeness:');
  console.log(`    Has Resume:     ${hasResume.rows[0].count}`);
  console.log(`    Has Headline:   ${hasHeadline.rows[0].count}`);
  console.log(`    Has Bio:        ${hasBio.rows[0].count}`);

  // Subscribers vs profiles overlap
  const overlap = await pool.query(`
    SELECT COUNT(DISTINCT el.email)
    FROM email_leads el
    INNER JOIN user_profiles up ON LOWER(el.email) = LOWER(up.email)
    WHERE el.is_subscribed = true
  `);
  console.log(`\n  Subscribers who ALSO have accounts: ${overlap.rows[0].count}`);

  // Total unique audience
  const totalUnique = await pool.query(`
    SELECT COUNT(*) FROM (
      SELECT LOWER(email) as e FROM user_profiles
      UNION
      SELECT LOWER(email) as e FROM email_leads WHERE is_subscribed = true
    ) combined
  `);
  console.log(`  Total Unique People (deduplicated): ${totalUnique.rows[0].count}`);

  // Email subscriber growth
  const subMonthly = await pool.query(`
    SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as cnt
    FROM email_leads WHERE is_subscribed = true
    GROUP BY month
    ORDER BY month DESC
    LIMIT 6
  `);
  console.log('\n  Email Subscriber Growth (last 6 months):');
  for (const r of subMonthly.rows) {
    console.log(`    ${r.month}   ${r.cnt}`);
  }

  console.log('\n');
  await pool.end();
}

main().catch(async (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(msg);
  await pool.end();
  process.exit(1);
});
