/**
 * E2E Job Source & Quality Analysis — Production Database
 * ========================================================
 * Comprehensive analysis covering:
 *   1. Source distribution & volume
 *   2. Ingestion trends (7d / 30d)
 *   3. Source quality scoring
 *   4. Data completeness
 *   5. Salary coverage & accuracy
 *   6. Job freshness & staleness
 *   7. Relevance audit (non-PMHNP detection)
 *   8. Duplicate analysis
 *   9. Engagement metrics (views & apply clicks by source)
 *  10. Rejected job analysis
 *  11. Geographic distribution
 *  12. Employer concentration
 *  13. SourceStats historical trends
 */
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.prod' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const connString = process.env.PROD_DATABASE_URL;
if (!connString) {
    console.error('❌ PROD_DATABASE_URL not found. Check .env.prod or .env.local');
    process.exit(1);
}

const pool = new Pool({ connectionString: connString });

const out: string[] = [];
function log(s: string) { out.push(s); console.log(s); }
function hr() { log('─'.repeat(70)); }
function section(title: string) { log('\n' + '═'.repeat(70)); log(`  ${title}`); log('═'.repeat(70)); }

async function main() {
    const client = await pool.connect();
    const now = new Date().toISOString();

    log(`🔬 PMHNP JOB BOARD — E2E PRODUCTION ANALYSIS`);
    log(`📅 Date: ${now}`);
    hr();

    // ───────────────────────────────────────────────────────────────────
    // 1. OVERVIEW
    // ───────────────────────────────────────────────────────────────────
    section('1. OVERVIEW');

    const totalRes = await client.query(`SELECT
    COUNT(*) FILTER (WHERE is_published = true)  as published,
    COUNT(*) FILTER (WHERE is_published = false) as unpublished,
    COUNT(*) as total
  FROM jobs`);
    const { published, unpublished, total } = totalRes.rows[0];
    log(`  Total Jobs:       ${total}`);
    log(`  Published:        ${published}`);
    log(`  Unpublished:      ${unpublished}`);

    const today24h = await client.query(`SELECT COUNT(*) as cnt FROM jobs WHERE is_published = true AND created_at > NOW() - INTERVAL '24 hours'`);
    const today7d = await client.query(`SELECT COUNT(*) as cnt FROM jobs WHERE is_published = true AND created_at > NOW() - INTERVAL '7 days'`);
    const today30d = await client.query(`SELECT COUNT(*) as cnt FROM jobs WHERE is_published = true AND created_at > NOW() - INTERVAL '30 days'`);
    log(`  Added last 24h:   ${today24h.rows[0].cnt}`);
    log(`  Added last 7d:    ${today7d.rows[0].cnt}`);
    log(`  Added last 30d:   ${today30d.rows[0].cnt}`);

    // ───────────────────────────────────────────────────────────────────
    // 2. SOURCE DISTRIBUTION (ALL-TIME)
    // ───────────────────────────────────────────────────────────────────
    section('2. SOURCE DISTRIBUTION (Published)');

    const sourceDist = await client.query(`
    SELECT source_provider,
           COUNT(*) as jobs,
           ROUND(COUNT(*)::numeric / ${published} * 100, 1) as pct,
           COUNT(DISTINCT employer) as employers,
           MIN(created_at)::date as first_seen,
           MAX(created_at)::date as last_seen
    FROM jobs WHERE is_published = true
    GROUP BY source_provider ORDER BY jobs DESC
  `);
    log(`  ${'Source'.padEnd(22)} ${'Jobs'.padStart(7)} ${'%'.padStart(6)} ${'Employers'.padStart(10)} ${'First Seen'.padStart(12)} ${'Last Seen'.padStart(12)}`);
    hr();
    for (const r of sourceDist.rows) {
        log(`  ${(r.source_provider || 'null').padEnd(22)} ${String(r.jobs).padStart(7)} ${String(r.pct + '%').padStart(6)} ${String(r.employers).padStart(10)} ${String(r.first_seen).padStart(12)} ${String(r.last_seen).padStart(12)}`);
    }

    // ───────────────────────────────────────────────────────────────────
    // 3. LAST 7 DAYS BY SOURCE
    // ───────────────────────────────────────────────────────────────────
    section('3. INGESTION — LAST 7 DAYS');

    const source7d = await client.query(`
    SELECT source_provider, COUNT(*) as jobs
    FROM jobs WHERE is_published = true AND created_at > NOW() - INTERVAL '7 days'
    GROUP BY source_provider ORDER BY jobs DESC
  `);
    const total7d = source7d.rows.reduce((s: number, r: any) => s + parseInt(r.jobs), 0);
    for (const r of source7d.rows) {
        const pct = ((parseInt(r.jobs) / total7d) * 100).toFixed(1);
        log(`  ${(r.source_provider || 'null').padEnd(22)} ${String(r.jobs).padStart(7)} jobs  (${pct}%)`);
    }
    log(`  ${'TOTAL'.padEnd(22)} ${String(total7d).padStart(7)} jobs`);

    // ───────────────────────────────────────────────────────────────────
    // 4. LAST 24 HOURS BY SOURCE
    // ───────────────────────────────────────────────────────────────────
    section('4. INGESTION — LAST 24 HOURS');

    const source24h = await client.query(`
    SELECT source_provider, COUNT(*) as jobs
    FROM jobs WHERE is_published = true AND created_at > NOW() - INTERVAL '24 hours'
    GROUP BY source_provider ORDER BY jobs DESC
  `);
    const total24h = source24h.rows.reduce((s: number, r: any) => s + parseInt(r.jobs), 0);
    for (const r of source24h.rows) {
        const pct = ((parseInt(r.jobs) / total24h) * 100).toFixed(1);
        log(`  ${(r.source_provider || 'null').padEnd(22)} ${String(r.jobs).padStart(7)} jobs  (${pct}%)`);
    }
    log(`  ${'TOTAL'.padEnd(22)} ${String(total24h).padStart(7)} jobs`);

    // ───────────────────────────────────────────────────────────────────
    // 5. SOURCE QUALITY SCORECARD
    // ───────────────────────────────────────────────────────────────────
    section('5. SOURCE QUALITY SCORECARD');

    const qualityRes = await client.query(`
    SELECT source_provider,
           COUNT(*) as total,
           ROUND(AVG(quality_score), 1) as avg_qual,
           ROUND(AVG(CASE WHEN normalized_min_salary IS NOT NULL THEN 1.0 ELSE 0 END) * 100, 1) as salary_pct,
           ROUND(AVG(CASE WHEN apply_link IS NOT NULL AND apply_link != '' THEN 1.0 ELSE 0 END) * 100, 1) as link_pct,
           ROUND(AVG(CASE WHEN city IS NOT NULL AND city != '' THEN 1.0 ELSE 0 END) * 100, 1) as city_pct,
           ROUND(AVG(CASE WHEN LENGTH(description) > 200 THEN 1.0 ELSE 0 END) * 100, 1) as desc_pct,
           ROUND(AVG(view_count), 1) as avg_views,
           ROUND(AVG(apply_click_count), 1) as avg_clicks
    FROM jobs WHERE is_published = true
    GROUP BY source_provider ORDER BY avg_qual DESC
  `);
    log(`  ${'Source'.padEnd(20)} ${'Jobs'.padStart(6)} ${'AvgQS'.padStart(6)} ${'Sal%'.padStart(6)} ${'Link%'.padStart(6)} ${'City%'.padStart(6)} ${'Desc%'.padStart(6)} ${'Views'.padStart(6)} ${'Clicks'.padStart(7)}`);
    hr();
    for (const r of qualityRes.rows) {
        log(`  ${(r.source_provider || 'null').padEnd(20)} ${String(r.total).padStart(6)} ${String(r.avg_qual).padStart(6)} ${String(r.salary_pct).padStart(6)} ${String(r.link_pct).padStart(6)} ${String(r.city_pct).padStart(6)} ${String(r.desc_pct).padStart(6)} ${String(r.avg_views).padStart(6)} ${String(r.avg_clicks).padStart(7)}`);
    }

    // ───────────────────────────────────────────────────────────────────
    // 6. SALARY ANALYSIS
    // ───────────────────────────────────────────────────────────────────
    section('6. SALARY ANALYSIS');

    const salCoverage = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE normalized_min_salary IS NOT NULL) as with_salary,
      COUNT(*) FILTER (WHERE normalized_min_salary IS NULL) as without_salary,
      ROUND(AVG(normalized_min_salary) FILTER (WHERE normalized_min_salary IS NOT NULL)) as avg_min,
      ROUND(AVG(normalized_max_salary) FILTER (WHERE normalized_max_salary IS NOT NULL)) as avg_max,
      MIN(normalized_min_salary) FILTER (WHERE normalized_min_salary IS NOT NULL) as min_salary,
      MAX(normalized_max_salary) FILTER (WHERE normalized_max_salary IS NOT NULL) as max_salary
    FROM jobs WHERE is_published = true
  `);
    const sal = salCoverage.rows[0];
    log(`  With salary:    ${sal.with_salary} (${Math.round(parseInt(sal.with_salary) / parseInt(published) * 100)}%)`);
    log(`  Without salary: ${sal.without_salary} (${Math.round(parseInt(sal.without_salary) / parseInt(published) * 100)}%)`);
    log(`  Avg range:      $${Math.round(sal.avg_min / 1000)}k - $${Math.round(sal.avg_max / 1000)}k/yr`);
    log(`  Min seen:       $${Math.round(sal.min_salary / 1000)}k/yr`);
    log(`  Max seen:       $${Math.round(sal.max_salary / 1000)}k/yr`);

    // Salary distribution buckets
    const salDist = await client.query(`
    SELECT bucket, COUNT(*) as cnt FROM (
      SELECT CASE
        WHEN normalized_min_salary < 80000 THEN 'a) Under $80k'
        WHEN normalized_min_salary < 100000 THEN 'b) $80k-$100k'
        WHEN normalized_min_salary < 120000 THEN 'c) $100k-$120k'
        WHEN normalized_min_salary < 150000 THEN 'd) $120k-$150k'
        WHEN normalized_min_salary < 200000 THEN 'e) $150k-$200k'
        WHEN normalized_min_salary < 250000 THEN 'f) $200k-$250k'
        ELSE 'g) $250k+'
      END as bucket
      FROM jobs WHERE is_published = true AND normalized_min_salary IS NOT NULL
    ) sub GROUP BY bucket ORDER BY bucket
  `);
    log(`\n  Salary Distribution:`);
    for (const r of salDist.rows) {
        const bar = '█'.repeat(Math.round(parseInt(r.cnt) / parseInt(sal.with_salary) * 40));
        log(`    ${r.bucket.padEnd(18)} ${String(r.cnt).padStart(5)}  ${bar}`);
    }

    // Salary by source
    const salBySource = await client.query(`
    SELECT source_provider,
           ROUND(AVG(normalized_min_salary)) as avg_min,
           ROUND(AVG(normalized_max_salary)) as avg_max,
           COUNT(*) as cnt
    FROM jobs WHERE is_published = true AND normalized_min_salary IS NOT NULL
    GROUP BY source_provider ORDER BY avg_min DESC
  `);
    log(`\n  Avg Salary by Source:`);
    for (const r of salBySource.rows) {
        log(`    ${(r.source_provider || 'null').padEnd(22)} $${Math.round(r.avg_min / 1000)}k - $${Math.round(r.avg_max / 1000)}k  (${r.cnt} jobs)`);
    }

    // ───────────────────────────────────────────────────────────────────
    // 7. FRESHNESS & STALENESS
    // ───────────────────────────────────────────────────────────────────
    section('7. JOB FRESHNESS');

    const freshness = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as fresh_7d,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days' AND created_at <= NOW() - INTERVAL '7 days') as recent_30d,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '60 days' AND created_at <= NOW() - INTERVAL '30 days') as aging_60d,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '90 days' AND created_at <= NOW() - INTERVAL '60 days') as stale_90d,
      COUNT(*) FILTER (WHERE created_at <= NOW() - INTERVAL '90 days') as very_stale
    FROM jobs WHERE is_published = true
  `);
    const f = freshness.rows[0];
    log(`  Fresh (0-7d):     ${f.fresh_7d}`);
    log(`  Recent (7-30d):   ${f.recent_30d}`);
    log(`  Aging (30-60d):   ${f.aging_60d}`);
    log(`  Stale (60-90d):   ${f.stale_90d}`);
    log(`  Very Stale (90d+): ${f.very_stale}`);

    // Expired but still published
    const expired = await client.query(`SELECT COUNT(*) as cnt FROM jobs WHERE is_published = true AND expires_at IS NOT NULL AND expires_at < NOW()`);
    log(`  Expired but published: ${expired.rows[0].cnt}`);

    // Staleness by source
    const staleBySource = await client.query(`
    SELECT source_provider,
           COUNT(*) FILTER (WHERE created_at <= NOW() - INTERVAL '60 days') as stale,
           COUNT(*) as total,
           ROUND(COUNT(*) FILTER (WHERE created_at <= NOW() - INTERVAL '60 days')::numeric / NULLIF(COUNT(*),0) * 100, 1) as stale_pct
    FROM jobs WHERE is_published = true
    GROUP BY source_provider HAVING COUNT(*) FILTER (WHERE created_at <= NOW() - INTERVAL '60 days') > 0
    ORDER BY stale_pct DESC
  `);
    if (staleBySource.rows.length > 0) {
        log(`\n  Staleness by Source (>60 days):`);
        for (const r of staleBySource.rows) {
            log(`    ${(r.source_provider || 'null').padEnd(22)} ${r.stale}/${r.total} (${r.stale_pct}% stale)`);
        }
    }

    // ───────────────────────────────────────────────────────────────────
    // 8. RELEVANCE AUDIT
    // ───────────────────────────────────────────────────────────────────
    section('8. RELEVANCE AUDIT (Non-PMHNP Titles)');

    const irrelevantCount = await client.query(`
    SELECT COUNT(*) as cnt FROM jobs WHERE is_published = true
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
      AND LOWER(title) NOT LIKE '%mental health nurse practitioner%'
      AND LOWER(title) NOT LIKE '%psychiatric%nurse%'
  `);
    log(`  Total potentially irrelevant: ${irrelevantCount.rows[0].cnt} / ${published} published`);

    const irrBySource = await client.query(`
    SELECT source_provider, COUNT(*) as cnt FROM jobs WHERE is_published = true
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
      AND LOWER(title) NOT LIKE '%mental health nurse practitioner%'
      AND LOWER(title) NOT LIKE '%psychiatric%nurse%'
    GROUP BY source_provider ORDER BY cnt DESC
  `);
    if (irrBySource.rows.length > 0) {
        log(`  By Source:`);
        for (const r of irrBySource.rows) {
            log(`    ${(r.source_provider || 'null').padEnd(22)} ${r.cnt} possibly off-topic`);
        }
    }

    const irrSamples = await client.query(`
    SELECT title, employer, source_provider FROM jobs WHERE is_published = true
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
      AND LOWER(title) NOT LIKE '%mental health nurse practitioner%'
      AND LOWER(title) NOT LIKE '%psychiatric%nurse%'
    ORDER BY created_at DESC LIMIT 20
  `);
    if (irrSamples.rows.length > 0) {
        log(`  Sample non-matching titles (newest 20):`);
        for (const r of irrSamples.rows) {
            log(`    ⚠️ [${r.source_provider}] "${r.title}" — ${r.employer}`);
        }
    }

    // ───────────────────────────────────────────────────────────────────
    // 9. DUPLICATE ANALYSIS
    // ───────────────────────────────────────────────────────────────────
    section('9. DUPLICATE ANALYSIS');

    // Same title + employer
    const dupeTitle = await client.query(`
    SELECT title, employer, COUNT(*) as cnt FROM jobs
    WHERE is_published = true
    GROUP BY title, employer HAVING COUNT(*) > 2
    ORDER BY cnt DESC LIMIT 15
  `);
    let dupeTitleTotal = 0;
    for (const r of dupeTitle.rows) dupeTitleTotal += parseInt(r.cnt);
    log(`  Duplicate title+employer groups (>2): ${dupeTitle.rows.length} groups, ${dupeTitleTotal} total jobs`);
    for (const r of dupeTitle.rows) {
        log(`    ${String(r.cnt).padStart(3)}x  "${r.title}" — ${r.employer}`);
    }

    // Same apply link
    const dupeLink = await client.query(`
    SELECT apply_link, COUNT(*) as cnt FROM jobs
    WHERE is_published = true AND apply_link IS NOT NULL AND apply_link != ''
    GROUP BY apply_link HAVING COUNT(*) > 1
    ORDER BY cnt DESC LIMIT 10
  `);
    let dupeLinkTotal = 0;
    for (const r of dupeLink.rows) dupeLinkTotal += parseInt(r.cnt);
    log(`\n  Duplicate apply links: ${dupeLink.rows.length} URLs, ${dupeLinkTotal} jobs`);

    // ───────────────────────────────────────────────────────────────────
    // 10. ENGAGEMENT METRICS
    // ───────────────────────────────────────────────────────────────────
    section('10. ENGAGEMENT METRICS');

    const engagement = await client.query(`
    SELECT
      SUM(view_count) as total_views,
      SUM(apply_click_count) as total_clicks,
      ROUND(SUM(apply_click_count)::numeric / NULLIF(SUM(view_count), 0) * 100, 2) as ctr
    FROM jobs WHERE is_published = true
  `);
    const eng = engagement.rows[0];
    log(`  Total Views:        ${eng.total_views}`);
    log(`  Total Apply Clicks: ${eng.total_clicks}`);
    log(`  Overall CTR:        ${eng.ctr}%`);

    // Engagement by source
    const engBySource = await client.query(`
    SELECT source_provider,
           SUM(view_count) as views,
           SUM(apply_click_count) as clicks,
           ROUND(SUM(apply_click_count)::numeric / NULLIF(SUM(view_count), 0) * 100, 2) as ctr,
           ROUND(AVG(view_count), 1) as avg_views,
           ROUND(AVG(apply_click_count), 1) as avg_clicks
    FROM jobs WHERE is_published = true
    GROUP BY source_provider ORDER BY views DESC
  `);
    log(`\n  ${'Source'.padEnd(22)} ${'Views'.padStart(8)} ${'Clicks'.padStart(8)} ${'CTR%'.padStart(7)} ${'Avg Views'.padStart(10)} ${'Avg Clicks'.padStart(11)}`);
    hr();
    for (const r of engBySource.rows) {
        log(`  ${(r.source_provider || 'null').padEnd(22)} ${String(r.views).padStart(8)} ${String(r.clicks).padStart(8)} ${String(r.ctr || '0').padStart(7)} ${String(r.avg_views).padStart(10)} ${String(r.avg_clicks).padStart(11)}`);
    }

    // Top 15 most-clicked jobs
    const topJobs = await client.query(`
    SELECT title, employer, source_provider, view_count, apply_click_count,
           CASE WHEN view_count > 0 THEN ROUND(apply_click_count::numeric / view_count * 100, 1) ELSE 0 END as ctr
    FROM jobs WHERE is_published = true AND apply_click_count > 0
    ORDER BY apply_click_count DESC LIMIT 15
  `);
    log(`\n  Top 15 Most-Clicked Jobs:`);
    for (const j of topJobs.rows) {
        log(`    ${String(j.apply_click_count).padStart(4)} clicks, ${String(j.view_count).padStart(5)} views (${j.ctr}% CTR) | [${j.source_provider}] "${j.title}" — ${j.employer}`);
    }

    // ───────────────────────────────────────────────────────────────────
    // 11. REJECTED JOBS ANALYSIS
    // ───────────────────────────────────────────────────────────────────
    section('11. REJECTED JOBS ANALYSIS');

    const rejTotal = await client.query(`SELECT COUNT(*) as cnt FROM rejected_jobs`);
    log(`  Total rejected: ${rejTotal.rows[0].cnt}`);

    const rejBySource = await client.query(`
    SELECT source_provider, COUNT(*) as cnt FROM rejected_jobs
    GROUP BY source_provider ORDER BY cnt DESC
  `);
    log(`\n  By Source:`);
    for (const r of rejBySource.rows) {
        log(`    ${(r.source_provider || 'null').padEnd(22)} ${String(r.cnt).padStart(7)}`);
    }

    const rejByReason = await client.query(`
    SELECT rejection_reason, COUNT(*) as cnt FROM rejected_jobs
    GROUP BY rejection_reason ORDER BY cnt DESC
  `);
    log(`\n  By Reason:`);
    for (const r of rejByReason.rows) {
        log(`    ${(r.rejection_reason || 'null').padEnd(30)} ${String(r.cnt).padStart(7)}`);
    }

    // Recent rejection samples
    const rejSamples = await client.query(`
    SELECT title, employer, source_provider, rejection_reason FROM rejected_jobs
    ORDER BY created_at DESC LIMIT 10
  `);
    log(`\n  Recent Rejections (10):`);
    for (const r of rejSamples.rows) {
        log(`    [${r.source_provider}] "${r.title}" — ${r.employer || 'unknown'} | Reason: ${r.rejection_reason}`);
    }

    // ───────────────────────────────────────────────────────────────────
    // 12. GEOGRAPHIC DISTRIBUTION
    // ───────────────────────────────────────────────────────────────────
    section('12. GEOGRAPHIC DISTRIBUTION');

    const stateDist = await client.query(`
    SELECT state_code, COUNT(*) as cnt FROM jobs
    WHERE is_published = true AND state_code IS NOT NULL AND state_code != ''
    GROUP BY state_code ORDER BY cnt DESC LIMIT 20
  `);
    log(`  Top 20 States:`);
    for (const r of stateDist.rows) {
        const bar = '█'.repeat(Math.min(40, Math.round(parseInt(r.cnt) / parseInt(published) * 200)));
        log(`    ${(r.state_code || '??').padEnd(4)} ${String(r.cnt).padStart(5)}  ${bar}`);
    }

    const remoteDist = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE is_remote = true) as remote,
      COUNT(*) FILTER (WHERE is_hybrid = true) as hybrid,
      COUNT(*) FILTER (WHERE is_remote = false AND is_hybrid = false) as onsite
    FROM jobs WHERE is_published = true
  `);
    const rm = remoteDist.rows[0];
    log(`\n  Remote: ${rm.remote}  |  Hybrid: ${rm.hybrid}  |  On-site: ${rm.onsite}`);

    // ───────────────────────────────────────────────────────────────────
    // 13. EMPLOYER CONCENTRATION
    // ───────────────────────────────────────────────────────────────────
    section('13. EMPLOYER CONCENTRATION');

    const empConc = await client.query(`
    SELECT employer, source_provider, COUNT(*) as cnt
    FROM jobs WHERE is_published = true
    GROUP BY employer, source_provider ORDER BY cnt DESC LIMIT 25
  `);
    log(`  Top 25 Employers:`);
    for (const r of empConc.rows) {
        log(`    ${String(r.cnt).padStart(5)} jobs  ${(r.employer || 'unknown').padEnd(40)} via ${r.source_provider || 'null'}`);
    }

    const uniqueEmp = await client.query(`SELECT COUNT(DISTINCT employer) as cnt FROM jobs WHERE is_published = true`);
    log(`\n  Total Unique Employers: ${uniqueEmp.rows[0].cnt}`);

    // ───────────────────────────────────────────────────────────────────
    // 14. SOURCE_STATS HISTORY (last 14 days)
    // ───────────────────────────────────────────────────────────────────
    section('14. SOURCE_STATS HISTORY (last 14 days)');

    try {
        const ssHistory = await client.query(`
      SELECT date::text, source,
             jobs_fetched, jobs_added, jobs_duplicate, jobs_expired,
             ROUND(avg_quality_score::numeric, 1) as avg_qs
      FROM source_stats
      WHERE date > NOW() - INTERVAL '14 days'
      ORDER BY date DESC, source
    `);
        if (ssHistory.rows.length > 0) {
            log(`  ${'Date'.padEnd(12)} ${'Source'.padEnd(18)} ${'Fetched'.padStart(8)} ${'Added'.padStart(7)} ${'Dups'.padStart(6)} ${'Expired'.padStart(8)} ${'AvgQS'.padStart(6)}`);
            hr();
            for (const r of ssHistory.rows) {
                log(`  ${r.date.padEnd(12)} ${(r.source || 'null').padEnd(18)} ${String(r.jobs_fetched).padStart(8)} ${String(r.jobs_added).padStart(7)} ${String(r.jobs_duplicate).padStart(6)} ${String(r.jobs_expired).padStart(8)} ${String(r.avg_qs || '-').padStart(6)}`);
            }
        } else {
            log(`  No source_stats data found in last 14 days.`);
        }
    } catch {
        log(`  ⚠️ source_stats table not found or error querying it.`);
    }

    // ───────────────────────────────────────────────────────────────────
    // 15. DATA COMPLETENESS HEATMAP
    // ───────────────────────────────────────────────────────────────────
    section('15. DATA COMPLETENESS');

    const completeness = await client.query(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN title IS NULL OR title = '' THEN 1 ELSE 0 END) as no_title,
      SUM(CASE WHEN employer IS NULL OR employer = '' THEN 1 ELSE 0 END) as no_employer,
      SUM(CASE WHEN apply_link IS NULL OR apply_link = '' THEN 1 ELSE 0 END) as no_link,
      SUM(CASE WHEN location IS NULL OR location = '' OR location = 'United States' THEN 1 ELSE 0 END) as no_location,
      SUM(CASE WHEN city IS NULL OR city = '' THEN 1 ELSE 0 END) as no_city,
      SUM(CASE WHEN state_code IS NULL OR state_code = '' THEN 1 ELSE 0 END) as no_state,
      SUM(CASE WHEN description IS NULL OR LENGTH(description) < 50 THEN 1 ELSE 0 END) as short_desc,
      SUM(CASE WHEN job_type IS NULL OR job_type = '' THEN 1 ELSE 0 END) as no_type,
      SUM(CASE WHEN normalized_min_salary IS NULL THEN 1 ELSE 0 END) as no_salary,
      SUM(CASE WHEN external_id IS NULL OR external_id = '' THEN 1 ELSE 0 END) as no_ext_id
    FROM jobs WHERE is_published = true
  `);
    const c = completeness.rows[0];
    const pct = (v: number) => Math.round((1 - v / parseInt(c.total)) * 100);
    log(`  Field              Missing  Completeness`);
    hr();
    const fields = [
        ['Title', c.no_title], ['Employer', c.no_employer], ['Apply Link', c.no_link],
        ['Location', c.no_location], ['City', c.no_city], ['State Code', c.no_state],
        ['Description (>50c)', c.short_desc], ['Job Type', c.no_type],
        ['Salary (normalized)', c.no_salary], ['External ID', c.no_ext_id]
    ];
    for (const [name, missing] of fields) {
        const p = pct(missing as number);
        const bar = '█'.repeat(Math.round(p / 2.5));
        log(`  ${(name as string).padEnd(22)} ${String(missing).padStart(6)}    ${String(p + '%').padStart(4)} ${bar}`);
    }

    // ───────────────────────────────────────────────────────────────────
    // 16. JOB TYPE DISTRIBUTION
    // ───────────────────────────────────────────────────────────────────
    section('16. JOB TYPE DISTRIBUTION');

    const typeDist = await client.query(`
    SELECT COALESCE(job_type, 'NULL') as jt, COUNT(*) as cnt
    FROM jobs WHERE is_published = true
    GROUP BY job_type ORDER BY cnt DESC
  `);
    for (const r of typeDist.rows) {
        const bar = '█'.repeat(Math.round(parseInt(r.cnt) / parseInt(published) * 50));
        log(`  ${(r.jt || 'null').padEnd(18)} ${String(r.cnt).padStart(6)}  ${bar}`);
    }

    // ───────────────────────────────────────────────────────────────────
    // 17. APPLY CLICK TRENDS (last 7 days)
    // ───────────────────────────────────────────────────────────────────
    section('17. APPLY CLICK TRENDS (last 7 days)');

    try {
        const clickTrends = await client.query(`
      SELECT timestamp::date as day, COUNT(*) as clicks
      FROM apply_clicks
      WHERE timestamp > NOW() - INTERVAL '7 days'
      GROUP BY day ORDER BY day DESC
    `);
        if (clickTrends.rows.length > 0) {
            for (const r of clickTrends.rows) {
                const bar = '█'.repeat(Math.min(40, parseInt(r.clicks)));
                log(`  ${String(r.day).padEnd(12)} ${String(r.clicks).padStart(5)} clicks  ${bar}`);
            }
        } else {
            log(`  No apply clicks in last 7 days.`);
        }
    } catch {
        log(`  ⚠️ apply_clicks table not found or error querying it.`);
    }

    // ───────────────────────────────────────────────────────────────────
    // 18. USER / SUBSCRIBER STATS
    // ───────────────────────────────────────────────────────────────────
    section('18. USER & SUBSCRIBER STATS');

    try {
        const users = await client.query(`
      SELECT role, COUNT(*) as cnt FROM user_profiles
      GROUP BY role ORDER BY cnt DESC
    `);
        log(`  User Profiles by Role:`);
        for (const r of users.rows) {
            log(`    ${(r.role || 'null').padEnd(20)} ${r.cnt}`);
        }

        const subs = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_subscribed = true) as active
      FROM email_leads
    `);
        log(`\n  Email Leads: ${subs.rows[0].total} total, ${subs.rows[0].active} active`);

        const alerts = await client.query(`
      SELECT COUNT(*) as total,
             COUNT(*) FILTER (WHERE is_active = true) as active
      FROM job_alerts
    `);
        log(`  Job Alerts:  ${alerts.rows[0].total} total, ${alerts.rows[0].active} active`);

        const apps = await client.query(`
      SELECT status, COUNT(*) as cnt FROM job_applications
      GROUP BY status ORDER BY cnt DESC
    `);
        log(`\n  Job Applications by Status:`);
        for (const r of apps.rows) {
            log(`    ${(r.status || 'null').padEnd(20)} ${r.cnt}`);
        }
    } catch {
        log(`  ⚠️ Error querying user/subscriber tables.`);
    }

    // ───────────────────────────────────────────────────────────────────
    // DONE
    // ───────────────────────────────────────────────────────────────────
    section('ANALYSIS COMPLETE');
    log(`  Report generated at: ${new Date().toISOString()}`);

    client.release();
    await pool.end();

    // Save report
    const reportPath = 'scripts/e2e-analysis-report.txt';
    fs.writeFileSync(reportPath, out.join('\n'), 'utf8');
    console.log(`\n📄 Full report saved: ${reportPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
