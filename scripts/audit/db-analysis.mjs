// Read-only production/staging DB health snapshot for the audit runbook.
// SELECT statements only — never mutates. See docs/AUDIT_RUNBOOK.md.
//
// Usage:
//   node scripts/audit/db-analysis.mjs                 # uses PROD_DATABASE_URL from .env.prod
//   AUDIT_DB_URL=postgres://... node scripts/audit/db-analysis.mjs
//   AUDIT_ENV_FILE=.env.local node scripts/audit/db-analysis.mjs
//
// Writes tmp/audit/db-report.md and prints red-flag deltas vs the 2026-05-31 baseline.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import pg from 'pg';

function connString() {
  if (process.env.AUDIT_DB_URL) return process.env.AUDIT_DB_URL.trim();
  const file = process.env.AUDIT_ENV_FILE || '.env.prod';
  const env = readFileSync(file, 'utf8');
  const key = file === '.env.prod' ? 'PROD_DATABASE_URL' : 'DATABASE_URL';
  const m = env.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!m) throw new Error(`${key} not found in ${file}`);
  return m[1].trim();
}

const pool = new pg.Pool({ connectionString: connString(), max: 3, ssl: { rejectUnauthorized: false } });
const out = [];
const w = (s = '') => out.push(s);
async function q(label, sql) {
  try { const r = await pool.query(sql); w(`\n### ${label}`); w(table(r.rows)); return r.rows; }
  catch (e) { w(`\n### ${label}\n_ERROR: ${e.message.slice(0, 160)}_`); return null; }
}
function table(rows) {
  if (!rows?.length) return '_(no rows)_';
  const c = Object.keys(rows[0]);
  return '| ' + c.join(' | ') + ' |\n| ' + c.map(() => '---').join(' | ') + ' |\n' +
    rows.slice(0, 60).map(r => '| ' + c.map(k => String(r[k] ?? '').slice(0, 60)).join(' | ') + ' |').join('\n');
}

w('# Production DB Analysis (read-only)\n');

// ── RED-FLAG GAUGES (compared to baseline in the runbook) ──
const gauges = await q('🚩 Red-flag gauges (should all be > 0 / healthy)', `
  SELECT
    (SELECT count(*) FROM job_embeddings)            AS job_embeddings_expect_gt0,
    (SELECT count(*) FROM candidate_recommendations) AS candidate_recs_expect_gt0,
    (SELECT count(*) FROM gsc_snapshots)             AS gsc_snapshots_expect_gt0,
    (SELECT count(DISTINCT name) FROM cron_runs WHERE started_at > now() - interval '7 days') AS distinct_crons_7d_expect_ge15,
    (SELECT count(*) FROM jobs WHERE is_published AND health_consecutive_missing > 0) AS dead_link_published_expect_0,
    (SELECT count(*) FROM jobs WHERE is_published AND length(description) < 300)     AS thin_desc_expect_low,
    (SELECT count(*) FROM job_charges)               AS stripe_charges`);

await q('Jobs — status overview', `
  SELECT count(*) total,
    count(*) FILTER (WHERE is_published) published,
    count(*) FILTER (WHERE NOT is_published) unpublished,
    count(*) FILTER (WHERE archived_at IS NOT NULL) archived,
    count(*) FILTER (WHERE source_type='employer' AND is_published) employer_published,
    count(*) FILTER (WHERE is_published AND expires_at < now()) expired_but_published
  FROM jobs`);
await q('Jobs by source_site (published top 15)', `SELECT source_site, count(*) FROM jobs WHERE is_published GROUP BY source_site ORDER BY count(*) DESC LIMIT 15`);
await q('Jobs — freshness (published)', `
  SELECT count(*) FILTER (WHERE original_posted_at >= now()-interval '7 days') d7,
         count(*) FILTER (WHERE original_posted_at >= now()-interval '30 days') d30,
         count(*) FILTER (WHERE original_posted_at < now()-interval '30 days') older_30d,
         count(*) FILTER (WHERE original_posted_at IS NULL) null_posted FROM jobs WHERE is_published`);
await q('Jobs — weak fields (published)', `
  SELECT count(*) total,
    count(*) FILTER (WHERE min_salary IS NULL AND salary_range IS NULL AND display_salary IS NULL) no_salary,
    count(*) FILTER (WHERE city IS NULL OR state_code IS NULL) no_city_or_state,
    count(*) FILTER (WHERE company_id IS NULL) no_company,
    count(*) FILTER (WHERE length(description) < 300) thin_desc,
    count(*) FILTER (WHERE quality_score <= 40) low_quality
  FROM jobs WHERE is_published`);
await q('pSEO — city combos by job-count bucket', `
  WITH c AS (SELECT city, state_code, count(*) n FROM jobs WHERE is_published AND city IS NOT NULL GROUP BY city, state_code)
  SELECT count(*) total, count(*) FILTER (WHERE n>=3) indexable_ge3, count(*) FILTER (WHERE n<3) thin_lt3 FROM c`);
await q('Engagement — views vs apply clicks (published)', `
  SELECT sum(view_count) views, sum(apply_click_count) apply_clicks,
    round(100.0*sum(apply_click_count)/NULLIF(sum(view_count),0),3) ctr_pct,
    count(*) FILTER (WHERE apply_click_count=0) zero_click_jobs FROM jobs WHERE is_published`);
await q('User profiles by role', `SELECT role, count(*), count(*) FILTER (WHERE deleted_at IS NOT NULL) soft_deleted FROM user_profiles GROUP BY role ORDER BY count(*) DESC`);
await q('Employer jobs (payment_status / tier)', `SELECT payment_status, pricing_tier, count(*) FROM employer_jobs GROUP BY payment_status, pricing_tier`);
await q('Cron runs — failures last 14d', `SELECT name, count(*) FILTER (WHERE NOT success) fails, count(*) total, max(started_at) last FROM cron_runs WHERE started_at > now()-interval '14 days' GROUP BY name ORDER BY fails DESC, total DESC`);
await q('Email — status funnel (single-mutable!)', `SELECT status, count(*) FROM email_sends GROUP BY status ORDER BY count(*) DESC`);
await q('Email — recent 7d by type', `SELECT email_type, count(*) FROM email_sends WHERE created_at > now()-interval '7 days' GROUP BY email_type ORDER BY count(*) DESC LIMIT 15`);
await q('Companies — logo coverage', `SELECT count(*) total, count(*) FILTER (WHERE logo_url IS NOT NULL) with_logo, count(*) FILTER (WHERE job_count>0) with_jobs FROM companies`);
await q('Embeddings coverage', `SELECT (SELECT count(*) FROM job_embeddings) job_emb, (SELECT count(*) FROM candidate_embeddings) cand_emb, (SELECT count(*) FROM user_profiles WHERE role='job_seeker') seekers, (SELECT count(*) FROM jobs WHERE is_published) pub_jobs`);
await q('Applications / conversations / reports', `SELECT (SELECT count(*) FROM job_applications) apps, (SELECT count(*) FROM conversations) convos, (SELECT count(*) FROM job_reports) reports, (SELECT count(*) FROM data_requests) dsar`);

mkdirSync('tmp/audit', { recursive: true });
writeFileSync('tmp/audit/db-report.md', out.join('\n'));
console.log(out.join('\n'));
console.log('\n=== RED FLAGS vs baseline (2026-05-31) ===');
if (gauges?.[0]) {
  const g = gauges[0];
  const flag = (cond, msg) => console.log((cond ? '🚩 ' : '✅ ') + msg);
  flag(+g.job_embeddings_expect_gt0 === 0, `job_embeddings = ${g.job_embeddings_expect_gt0} (expect >0; 0 = AI search dead)`);
  flag(+g.candidate_recs_expect_gt0 === 0, `candidate_recommendations = ${g.candidate_recs_expect_gt0} (expect >0)`);
  flag(+g.gsc_snapshots_expect_gt0 === 0, `gsc_snapshots = ${g.gsc_snapshots_expect_gt0} (expect >0; 0 = GSC monitoring dormant)`);
  flag(+g.distinct_crons_7d_expect_ge15 < 15, `distinct crons logged 7d = ${g.distinct_crons_7d_expect_ge15} (expect >=15; low = untracked crons)`);
  flag(+g.dead_link_published_expect_0 > 0, `dead-link published jobs = ${g.dead_link_published_expect_0} (expect 0)`);
}
console.log('\nWROTE tmp/audit/db-report.md');
await pool.end();
