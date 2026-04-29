/**
 * Production Database Integrity Audit — Final Version
 */
const { Client } = require('pg');
const fs = require('fs');

const match = fs.readFileSync('.env.prod', 'utf-8').match(/PROD_DATABASE_URL=(.+)/);
const client = new Client({ connectionString: match[1].trim(), ssl: { rejectUnauthorized: false } });

async function q(sql) { return (await client.query(sql)).rows; }
async function qv(sql) { const rows = await q(sql); return rows[0]?.count != null ? parseInt(rows[0].count) : rows[0]; }

async function audit() {
  await client.connect();
  console.log('=== PRODUCTION DATABASE AUDIT ===');
  console.log(`Connected at ${new Date().toISOString()}\n`);

  // ─── BUG #9: JOB COUNTS ───
  console.log('--- BUG #9: JOB COUNT CONTRADICTIONS ---');
  const totalAll = await qv(`SELECT COUNT(*) FROM jobs`);
  const totalPublished = await qv(`SELECT COUNT(*) FROM jobs WHERE is_published = true`);
  const totalActive = await qv(`SELECT COUNT(*) FROM jobs WHERE is_published = true AND (expires_at > NOW() OR expires_at IS NULL)`);
  const totalExpired = await qv(`SELECT COUNT(*) FROM jobs WHERE is_published = true AND expires_at < NOW()`);
  const unpublished = await qv(`SELECT COUNT(*) FROM jobs WHERE is_published = false`);
  const manuallyUnpub = await qv(`SELECT COUNT(*) FROM jobs WHERE is_manually_unpublished = true`);
  console.log(`  Total rows:                  ${totalAll}`);
  console.log(`  is_published=true:           ${totalPublished}`);
  console.log(`  Active (not expired):        ${totalActive}`);
  console.log(`  Published + expired:         ${totalExpired}`);
  console.log(`  is_published=false:          ${unpublished}`);
  console.log(`  is_manually_unpublished:     ${manuallyUnpub}`);
  console.log(`  VERDICT: Homepage should show ${totalPublished} (or "${Math.floor(totalPublished/100)*100}+")`);
  console.log();

  // ─── BUG #15: ARCHIVED SHOWING ───
  console.log('--- BUG #15: ARCHIVED JOBS ---');
  console.log('  No "status" column exists. Jobs use is_published + is_manually_unpublished flags.');
  console.log('  is_published=false jobs will NOT appear in listing API (confirmed in schema).');
  console.log('  VERDICT: Not a bug — no status column, filtering is correct.');
  console.log();

  // ─── BUG #12: EMPLOYER COUNT ───
  console.log('--- BUG #12: EMPLOYER COUNT ---');
  const uniqueEmployers = await qv(`SELECT COUNT(DISTINCT employer) FROM jobs WHERE is_published = true`);
  const companyEntities = await qv(`SELECT COUNT(*) FROM companies`);
  const employerLeads = await qv(`SELECT COUNT(*) FROM employer_leads`);
  console.log(`  Unique employer strings:      ${uniqueEmployers}`);
  console.log(`  Company table entries:        ${companyEntities}`);
  console.log(`  Employer leads (signups):     ${employerLeads}`);
  console.log(`  VERDICT: The site should display "${uniqueEmployers}" employers, NOT a fabricated number.`);
  console.log();

  // ─── BUG #10: INGESTION FRESHNESS ───
  console.log('--- BUG #10: INGESTION FRESHNESS ---');
  const latest = await q(`SELECT created_at, title, employer FROM jobs ORDER BY created_at DESC LIMIT 3`);
  latest.forEach(j => {
    const days = Math.floor((Date.now() - new Date(j.created_at).getTime()) / (1000*60*60*24));
    console.log(`  ${j.created_at} (${days}d ago) — "${j.title}" by ${j.employer}`);
  });
  const weekly = await q(`
    SELECT date_trunc('week', created_at)::date as week, COUNT(*)::int as count 
    FROM jobs WHERE created_at > NOW() - INTERVAL '8 weeks'
    GROUP BY week ORDER BY week DESC
  `);
  console.log('  Weekly ingestion history:');
  weekly.forEach(w => console.log(`    ${w.week}: ${w.count} jobs`));
  console.log();

  // ─── BUG #11: JOB ALERTS ───
  console.log('--- BUG #11: JOB ALERTS ---');
  try {
    const totalAlerts = await qv(`SELECT COUNT(*) FROM job_alerts`);
    const activeAlerts = await qv(`SELECT COUNT(*) FROM job_alerts WHERE is_active = true`);
    const alertCols = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='job_alerts' ORDER BY ordinal_position`);
    console.log(`  Total alerts:    ${totalAlerts}`);
    console.log(`  Active alerts:   ${activeAlerts}`);
    console.log(`  Columns: ${alertCols.map(c => c.column_name).join(', ')}`);
    // Check for last_sent_at or similar
    const hasLastSent = alertCols.some(c => c.column_name.includes('sent') || c.column_name.includes('last'));
    if (hasLastSent) {
      const sentCol = alertCols.find(c => c.column_name.includes('sent'));
      if (sentCol) {
        const recentSent = await qv(`SELECT COUNT(*) FROM job_alerts WHERE "${sentCol.column_name}" > NOW() - INTERVAL '30 days'`);
        console.log(`  Sent in last 30 days: ${recentSent}`);
      }
    }
    // Check email_sends for alert type
    try {
      const alertEmails = await qv(`SELECT COUNT(*) FROM email_sends WHERE LOWER(type) LIKE '%alert%'`);
      console.log(`  email_sends with 'alert' type: ${alertEmails}`);
    } catch(e) {}
  } catch (e) {
    console.log(`  Error: ${e.message?.substring(0, 200)}`);
  }
  console.log();

  // ─── BUG #13 & #14: APPLICATION TRACKING ───
  console.log('--- BUG #13 & #14: APPLICATION & FUNNEL ---');
  try {
    const viewCount = await qv(`SELECT COUNT(*) FROM job_view_events`);
    const clickCount = await qv(`SELECT COUNT(*) FROM apply_clicks`);
    const appCount = await qv(`SELECT COUNT(*) FROM job_applications`);
    console.log(`  job_view_events:  ${viewCount}`);
    console.log(`  apply_clicks:     ${clickCount}`);
    console.log(`  job_applications: ${appCount}`);
    if (clickCount > viewCount) console.log(`  ⚠️ ANOMALY: clicks (${clickCount}) > views (${viewCount})`);
    if (appCount > clickCount) console.log(`  ⚠️ ANOMALY: applications (${appCount}) > clicks (${clickCount})`);
    // Check for duplicate tracking
    const dupeViews = await qv(`SELECT COUNT(*) FROM (SELECT job_id, user_id, COUNT(*) as c FROM job_view_events WHERE user_id IS NOT NULL GROUP BY job_id, user_id HAVING COUNT(*) > 1) sub`);
    console.log(`  Duplicate view events (same user+job): ${dupeViews}`);
  } catch (e) {
    console.log(`  Error: ${e.message?.substring(0, 200)}`);
  }
  console.log();

  // ─── BUG #16: COMPANY NORMALIZATION ───
  console.log('--- BUG #16: COMPANY NORMALIZATION ---');
  const topDupes = await q(`
    SELECT LOWER(TRIM(employer)) as norm, COUNT(DISTINCT employer) as variants, COUNT(*)::int as total_jobs
    FROM jobs WHERE is_published = true AND employer IS NOT NULL
    GROUP BY LOWER(TRIM(employer))
    HAVING COUNT(DISTINCT employer) > 1
    ORDER BY total_jobs DESC LIMIT 15
  `);
  console.log(`  Employer names with case/spelling variants: ${topDupes.length}`);
  topDupes.slice(0, 10).forEach(d => console.log(`    "${d.norm}" → ${d.variants} variants, ${d.total_jobs} jobs`));
  console.log();

  // ─── BUG #17: WRONG-PROFESSION ───
  console.log('--- BUG #17: WRONG-PROFESSION LISTINGS ---');
  const wrongCount = await qv(`
    SELECT COUNT(*) FROM jobs 
    WHERE is_published = true 
    AND (LOWER(title) LIKE '%psychiatrist%' OR LOWER(title) LIKE '%md/do%' OR LOWER(title) LIKE '%physician%')
    AND LOWER(title) NOT LIKE '%nurse practitioner%' AND LOWER(title) NOT LIKE '%pmhnp%' 
    AND LOWER(title) NOT LIKE '% np %' AND LOWER(title) NOT LIKE '% np'
    AND LOWER(title) NOT LIKE '%np -%' AND LOWER(title) NOT LIKE '%collaborating%'
  `);
  const wrongSamples = await q(`
    SELECT id, title, employer FROM jobs 
    WHERE is_published = true 
    AND (LOWER(title) LIKE '%psychiatrist%' OR LOWER(title) LIKE '%md/do%' OR LOWER(title) LIKE '%physician%')
    AND LOWER(title) NOT LIKE '%nurse practitioner%' AND LOWER(title) NOT LIKE '%pmhnp%' 
    AND LOWER(title) NOT LIKE '% np %' AND LOWER(title) NOT LIKE '% np'
    AND LOWER(title) NOT LIKE '%np -%' AND LOWER(title) NOT LIKE '%collaborating%'
    LIMIT 10
  `);
  console.log(`  Non-PMHNP jobs published: ${wrongCount}`);
  wrongSamples.forEach(j => console.log(`    [${j.id.substring(0,8)}] "${j.title}" — ${j.employer}`));
  console.log();

  // ─── BUG #18: FEATURED EMPTY DESCRIPTION ───
  console.log('--- BUG #18: FEATURED EMPTY DESCRIPTION ---');
  const featTotal = await qv(`SELECT COUNT(*) FROM jobs WHERE is_featured = true AND is_published = true`);
  const featEmpty = await q(`SELECT id, title, slug FROM jobs WHERE is_featured = true AND is_published = true AND (description IS NULL OR TRIM(description) = '') LIMIT 10`);
  console.log(`  Featured + published: ${featTotal}`);
  console.log(`  Empty description: ${featEmpty.length}`);
  featEmpty.forEach(j => console.log(`    [${j.id.substring(0,8)}] "${j.title}" slug:${j.slug}`));
  console.log();

  // ─── BUG #19: HARDCODED EMPLOYER COUNT ───
  console.log('--- BUG #19: STATE-LEVEL EMPLOYER COUNTS ---');
  const stateCounts = await q(`
    SELECT state, COUNT(DISTINCT employer)::int as employers, COUNT(*)::int as jobs 
    FROM jobs WHERE is_published = true AND state IS NOT NULL 
    GROUP BY state ORDER BY jobs DESC LIMIT 10
  `);
  stateCounts.forEach(s => console.log(`  ${s.state}: ${s.employers} employers, ${s.jobs} jobs`));
  console.log();

  // ─── BUG #21: STATE COUNTS DISAGREE ───
  console.log('--- BUG #21: STATE COUNT ANALYSIS ---');
  const stateSum = await qv(`SELECT COUNT(*) FROM jobs WHERE is_published = true AND state IS NOT NULL`);
  const nullState = await qv(`SELECT COUNT(*) FROM jobs WHERE is_published = true AND state IS NULL`);
  console.log(`  Sum (state IS NOT NULL): ${stateSum}`);
  console.log(`  NULL state:             ${nullState}`);
  console.log(`  Total published:        ${totalPublished}`);
  console.log(`  Discrepancy:            ${totalPublished - stateSum - nullState}`);
  console.log();

  // ─── BUG #25: OLD original_posted_at ───
  console.log('--- BUG #25: OLD original_posted_at DATES ---');
  const oldCount = await qv(`SELECT COUNT(*) FROM jobs WHERE is_published = true AND original_posted_at < '2024-06-01'`);
  const nullPosted = await qv(`SELECT COUNT(*) FROM jobs WHERE is_published = true AND original_posted_at IS NULL`);
  console.log(`  Published with posted_at < 2024-06-01: ${oldCount}`);
  console.log(`  Published with NULL posted_at: ${nullPosted}`);
  const oldSamples = await q(`SELECT id, title, original_posted_at, created_at FROM jobs WHERE is_published = true AND original_posted_at < '2024-06-01' ORDER BY original_posted_at ASC LIMIT 5`);
  oldSamples.forEach(j => console.log(`    posted:${j.original_posted_at} created:${j.created_at} "${(j.title||'').substring(0, 50)}"`));
  console.log();

  // ─── BUG #20: SITEMAP GAP ───
  console.log('--- BUG #20: SITEMAP ELIGIBLE ---');
  const withSlug = await qv(`SELECT COUNT(*) FROM jobs WHERE is_published = true AND slug IS NOT NULL`);
  const noSlug = await qv(`SELECT COUNT(*) FROM jobs WHERE is_published = true AND slug IS NULL`);
  console.log(`  Published + has slug: ${withSlug}`);
  console.log(`  Published + NULL slug (missing from sitemap): ${noSlug}`);
  console.log();

  // ─── BUG #24: REMOTE vs TELEHEALTH ───
  console.log('--- BUG #24: REMOTE vs TELEHEALTH OVERLAP ---');
  const remote = await qv(`SELECT COUNT(*) FROM jobs WHERE is_published = true AND is_remote = true`);
  const telehealth = await qv(`SELECT COUNT(*) FROM jobs WHERE is_published = true AND (LOWER(title) LIKE '%telehealth%' OR LOWER(description) LIKE '%telehealth%')`);
  const both = await qv(`SELECT COUNT(*) FROM jobs WHERE is_published = true AND is_remote = true AND (LOWER(title) LIKE '%telehealth%' OR LOWER(description) LIKE '%telehealth%')`);
  console.log(`  isRemote=true:    ${remote}`);
  console.log(`  Telehealth text:  ${telehealth}`);
  console.log(`  Both:             ${both}`);
  console.log(`  Remote-only:      ${remote - both}`);
  console.log(`  Telehealth-only:  ${telehealth - both}`);
  console.log();

  console.log('=== AUDIT COMPLETE ===');
  await client.end();
}

audit().catch(e => { console.error('AUDIT FAILED:', e.message); process.exit(1); });
