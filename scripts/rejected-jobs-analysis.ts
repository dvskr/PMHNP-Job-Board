/**
 * REJECTED JOBS DEEP DIVE — Production Database
 * ================================================
 * Comprehensive analysis of rejected_jobs table:
 *   1. Volume & rejection reasons
 *   2. Source breakdown
 *   3. Title analysis (are legit PMHNP jobs being rejected?)
 *   4. Employer patterns
 *   5. Temporal trends
 *   6. raw_data deep inspection (salary, location, posted date)
 *   7. Comparison: rejected vs accepted ratio by source
 *   8. Recoverability assessment
 */
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.prod' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const connString = process.env.PROD_DATABASE_URL;
if (!connString) {
    console.error('❌ PROD_DATABASE_URL not found'); process.exit(1);
}

const pool = new Pool({ connectionString: connString });
const out: string[] = [];
function log(s: string) { out.push(s); console.log(s); }
function hr() { log('─'.repeat(70)); }
function section(title: string) { log('\n' + '═'.repeat(70)); log(`  ${title}`); log('═'.repeat(70)); }

async function main() {
    const client = await pool.connect();

    log(`🔬 REJECTED JOBS DEEP DIVE — PRODUCTION DB`);
    log(`📅 ${new Date().toISOString()}`);
    hr();

    // ───────────────────────────────────────────────────────────────────
    // 1. OVERVIEW
    // ───────────────────────────────────────────────────────────────────
    section('1. OVERVIEW');

    const total = await client.query(`SELECT COUNT(*) as cnt FROM rejected_jobs`);
    log(`  Total Rejected Jobs: ${total.rows[0].cnt}`);

    const oldest = await client.query(`SELECT MIN(created_at) as oldest, MAX(created_at) as newest FROM rejected_jobs`);
    log(`  Date Range: ${oldest.rows[0].oldest} → ${oldest.rows[0].newest}`);

    // ───────────────────────────────────────────────────────────────────
    // 2. BY REJECTION REASON
    // ───────────────────────────────────────────────────────────────────
    section('2. REJECTION REASONS');

    const byReason = await client.query(`
    SELECT rejection_reason, COUNT(*) as cnt,
           ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM rejected_jobs) * 100, 1) as pct
    FROM rejected_jobs GROUP BY rejection_reason ORDER BY cnt DESC
  `);
    for (const r of byReason.rows) {
        log(`  ${(r.rejection_reason || 'null').padEnd(30)} ${String(r.cnt).padStart(6)} (${r.pct}%)`);
    }

    // ───────────────────────────────────────────────────────────────────
    // 3. BY SOURCE PROVIDER
    // ───────────────────────────────────────────────────────────────────
    section('3. BY SOURCE PROVIDER');

    const bySource = await client.query(`
    SELECT source_provider, COUNT(*) as rejected,
           rejection_reason
    FROM rejected_jobs
    GROUP BY source_provider, rejection_reason
    ORDER BY rejected DESC
  `);
    log(`  ${'Source'.padEnd(22)} ${'Reason'.padEnd(25)} ${'Rejected'.padStart(8)}`);
    hr();
    for (const r of bySource.rows) {
        log(`  ${(r.source_provider || 'null').padEnd(22)} ${(r.rejection_reason || 'null').padEnd(25)} ${String(r.rejected).padStart(8)}`);
    }

    // ───────────────────────────────────────────────────────────────────
    // 4. REJECTED vs ACCEPTED RATIO BY SOURCE
    // ───────────────────────────────────────────────────────────────────
    section('4. REJECTED vs ACCEPTED RATIO');

    const ratio = await client.query(`
    SELECT r.source_provider,
           r.rejected,
           COALESCE(a.accepted, 0) as accepted,
           CASE WHEN COALESCE(a.accepted, 0) + r.rejected > 0
                THEN ROUND(r.rejected::numeric / (COALESCE(a.accepted, 0) + r.rejected) * 100, 1)
                ELSE 0 END as reject_pct
    FROM (
      SELECT source_provider, COUNT(*) as rejected FROM rejected_jobs GROUP BY source_provider
    ) r
    LEFT JOIN (
      SELECT source_provider, COUNT(*) as accepted FROM jobs WHERE is_published = true GROUP BY source_provider
    ) a ON r.source_provider = a.source_provider
    ORDER BY r.rejected DESC
  `);
    log(`  ${'Source'.padEnd(22)} ${'Rejected'.padStart(9)} ${'Accepted'.padStart(9)} ${'Reject%'.padStart(9)}`);
    hr();
    for (const r of ratio.rows) {
        log(`  ${(r.source_provider || 'null').padEnd(22)} ${String(r.rejected).padStart(9)} ${String(r.accepted).padStart(9)} ${String(r.reject_pct + '%').padStart(9)}`);
    }

    // ───────────────────────────────────────────────────────────────────
    // 5. TITLE ANALYSIS — PMHNP RELEVANCE OF REJECTED JOBS
    // ───────────────────────────────────────────────────────────────────
    section('5. TITLE RELEVANCE — ARE LEGIT PMHNP JOBS BEING REJECTED?');

    const pmhnpRejected = await client.query(`
    SELECT COUNT(*) as cnt FROM rejected_jobs
    WHERE LOWER(title) LIKE '%pmhnp%'
       OR LOWER(title) LIKE '%psychiatric nurse%'
       OR LOWER(title) LIKE '%psychiatric mental health%'
       OR LOWER(title) LIKE '%psych np%'
       OR LOWER(title) LIKE '%psychiatric aprn%'
       OR LOWER(title) LIKE '%psychiatric arnp%'
       OR LOWER(title) LIKE '%mental health np%'
       OR LOWER(title) LIKE '%psychiatric prescriber%'
       OR LOWER(title) LIKE '%psych nurse practitioner%'
       OR LOWER(title) LIKE '%mental health nurse practitioner%'
       OR LOWER(title) LIKE '%psychiatric%nurse%'
       OR LOWER(title) LIKE '%psychiatry nurse practitioner%'
  `);
    const nonPmhnpRejected = await client.query(`
    SELECT COUNT(*) as cnt FROM rejected_jobs
    WHERE LOWER(title) NOT LIKE '%pmhnp%'
      AND LOWER(title) NOT LIKE '%psychiatric nurse%'
      AND LOWER(title) NOT LIKE '%psychiatric mental health%'
      AND LOWER(title) NOT LIKE '%psych np%'
      AND LOWER(title) NOT LIKE '%psychiatric aprn%'
      AND LOWER(title) NOT LIKE '%psychiatric arnp%'
      AND LOWER(title) NOT LIKE '%mental health np%'
      AND LOWER(title) NOT LIKE '%psychiatric prescriber%'
      AND LOWER(title) NOT LIKE '%psych nurse practitioner%'
      AND LOWER(title) NOT LIKE '%mental health nurse practitioner%'
      AND LOWER(title) NOT LIKE '%psychiatric%nurse%'
      AND LOWER(title) NOT LIKE '%psychiatry nurse practitioner%'
  `);

    log(`  ✅ PMHNP-relevant titles rejected:     ${pmhnpRejected.rows[0].cnt}`);
    log(`  ❌ Non-PMHNP titles rejected:           ${nonPmhnpRejected.rows[0].cnt}`);
    log(`  ⚠️ ${Math.round(parseInt(pmhnpRejected.rows[0].cnt) / parseInt(total.rows[0].cnt) * 100)}% of rejected jobs appear to be LEGITIMATE PMHNP jobs!`);

    // PMHNP-relevant rejected by source
    const pmhnpBySource = await client.query(`
    SELECT source_provider, COUNT(*) as cnt FROM rejected_jobs
    WHERE LOWER(title) LIKE '%pmhnp%'
       OR LOWER(title) LIKE '%psychiatric nurse%'
       OR LOWER(title) LIKE '%psychiatric mental health%'
       OR LOWER(title) LIKE '%psych np%'
       OR LOWER(title) LIKE '%psychiatric aprn%'
       OR LOWER(title) LIKE '%psychiatric arnp%'
       OR LOWER(title) LIKE '%mental health np%'
       OR LOWER(title) LIKE '%psychiatric prescriber%'
       OR LOWER(title) LIKE '%psych nurse practitioner%'
       OR LOWER(title) LIKE '%mental health nurse practitioner%'
       OR LOWER(title) LIKE '%psychiatric%nurse%'
       OR LOWER(title) LIKE '%psychiatry nurse practitioner%'
    GROUP BY source_provider ORDER BY cnt DESC
  `);
    log(`\n  Legit PMHNP rejections by source:`);
    for (const r of pmhnpBySource.rows) {
        log(`    ${(r.source_provider || 'null').padEnd(22)} ${r.cnt} legitimate jobs rejected`);
    }

    // ───────────────────────────────────────────────────────────────────
    // 6. FULL TITLE LISTING OF REJECTED PMHNP JOBS
    // ───────────────────────────────────────────────────────────────────
    section('6. ALL REJECTED PMHNP-RELEVANT TITLES');

    const pmhnpTitles = await client.query(`
    SELECT title, employer, source_provider, rejection_reason, location, apply_link,
           created_at::date as rejected_on
    FROM rejected_jobs
    WHERE LOWER(title) LIKE '%pmhnp%'
       OR LOWER(title) LIKE '%psychiatric nurse%'
       OR LOWER(title) LIKE '%psychiatric mental health%'
       OR LOWER(title) LIKE '%psych np%'
       OR LOWER(title) LIKE '%psychiatric aprn%'
       OR LOWER(title) LIKE '%psychiatric arnp%'
       OR LOWER(title) LIKE '%mental health np%'
       OR LOWER(title) LIKE '%psychiatric prescriber%'
       OR LOWER(title) LIKE '%psych nurse practitioner%'
       OR LOWER(title) LIKE '%mental health nurse practitioner%'
       OR LOWER(title) LIKE '%psychiatric%nurse%'
       OR LOWER(title) LIKE '%psychiatry nurse practitioner%'
    ORDER BY source_provider, created_at DESC
  `);
    log(`  Total: ${pmhnpTitles.rows.length}\n`);

    // Group by source
    const grouped: Record<string, typeof pmhnpTitles.rows> = {};
    for (const r of pmhnpTitles.rows) {
        const src = r.source_provider || 'null';
        if (!grouped[src]) grouped[src] = [];
        grouped[src].push(r);
    }
    for (const [source, jobs] of Object.entries(grouped)) {
        log(`  ── ${source.toUpperCase()} (${jobs.length} rejected) ──`);
        for (const j of jobs) {
            log(`    "${j.title}"`);
            log(`      Employer: ${j.employer || 'unknown'} | Location: ${j.location || 'N/A'} | Reason: ${j.rejection_reason} | Date: ${j.rejected_on}`);
            if (j.apply_link) log(`      Link: ${j.apply_link}`);
        }
        log('');
    }

    // ───────────────────────────────────────────────────────────────────
    // 7. NON-PMHNP REJECTED TITLES (what DID get correctly rejected?)
    // ───────────────────────────────────────────────────────────────────
    section('7. NON-PMHNP REJECTED (correctly filtered, sample 30)');

    const nonPmhnpSample = await client.query(`
    SELECT title, employer, source_provider, rejection_reason
    FROM rejected_jobs
    WHERE LOWER(title) NOT LIKE '%pmhnp%'
      AND LOWER(title) NOT LIKE '%psychiatric nurse%'
      AND LOWER(title) NOT LIKE '%psychiatric mental health%'
      AND LOWER(title) NOT LIKE '%psych np%'
      AND LOWER(title) NOT LIKE '%psychiatric aprn%'
      AND LOWER(title) NOT LIKE '%psychiatric arnp%'
      AND LOWER(title) NOT LIKE '%mental health np%'
      AND LOWER(title) NOT LIKE '%psychiatric prescriber%'
      AND LOWER(title) NOT LIKE '%psych nurse practitioner%'
      AND LOWER(title) NOT LIKE '%mental health nurse practitioner%'
      AND LOWER(title) NOT LIKE '%psychiatric%nurse%'
      AND LOWER(title) NOT LIKE '%psychiatry nurse practitioner%'
    ORDER BY created_at DESC LIMIT 30
  `);
    for (const r of nonPmhnpSample.rows) {
        log(`  [${r.source_provider}] "${r.title}" — ${r.employer || 'unknown'} (${r.rejection_reason})`);
    }

    // ───────────────────────────────────────────────────────────────────
    // 8. EMPLOYER PATTERNS IN REJECTED JOBS
    // ───────────────────────────────────────────────────────────────────
    section('8. TOP EMPLOYERS IN REJECTED JOBS');

    const rejEmployers = await client.query(`
    SELECT employer, source_provider, COUNT(*) as cnt
    FROM rejected_jobs
    GROUP BY employer, source_provider ORDER BY cnt DESC LIMIT 20
  `);
    for (const r of rejEmployers.rows) {
        log(`  ${String(r.cnt).padStart(5)}x  ${(r.employer || 'unknown').padEnd(40)} via ${r.source_provider}`);
    }

    // ───────────────────────────────────────────────────────────────────
    // 9. TEMPORAL TRENDS
    // ───────────────────────────────────────────────────────────────────
    section('9. REJECTION TRENDS (by week)');

    const weekly = await client.query(`
    SELECT DATE_TRUNC('week', created_at)::date as week, source_provider, COUNT(*) as cnt
    FROM rejected_jobs
    GROUP BY week, source_provider
    ORDER BY week DESC, cnt DESC
  `);
    // Group by week
    const weekMap: Record<string, Record<string, number>> = {};
    for (const r of weekly.rows) {
        const w = String(r.week);
        if (!weekMap[w]) weekMap[w] = {};
        weekMap[w][r.source_provider] = parseInt(r.cnt);
    }
    for (const [week, sources] of Object.entries(weekMap)) {
        const parts = Object.entries(sources).map(([s, c]) => `${s}:${c}`).join(', ');
        const total = Object.values(sources).reduce((a, b) => a + b, 0);
        log(`  ${week.padEnd(12)} ${String(total).padStart(5)} total → ${parts}`);
    }

    // ───────────────────────────────────────────────────────────────────
    // 10. RAW DATA INSPECTION — what fields are in raw_data?
    // ───────────────────────────────────────────────────────────────────
    section('10. RAW DATA FIELD INSPECTION');

    const rawSample = await client.query(`
    SELECT raw_data FROM rejected_jobs
    WHERE raw_data IS NOT NULL
    LIMIT 5
  `);
    if (rawSample.rows.length > 0) {
        // Collect all keys across samples
        const allKeys = new Set<string>();
        for (const r of rawSample.rows) {
            if (r.raw_data && typeof r.raw_data === 'object') {
                Object.keys(r.raw_data).forEach(k => allKeys.add(k));
            }
        }
        log(`  Fields found in raw_data: ${Array.from(allKeys).join(', ')}`);
        log(`\n  Sample raw_data objects (first 3):`);
        for (let i = 0; i < Math.min(3, rawSample.rows.length); i++) {
            const rd = rawSample.rows[i].raw_data;
            log(`  ${i + 1}. ${JSON.stringify(rd, null, 2).split('\n').slice(0, 15).join('\n     ')}`);
            if (JSON.stringify(rd).length > 500) log(`     ... (truncated)`);
            log('');
        }
    } else {
        log('  No raw_data found in rejected_jobs.');
    }

    // ───────────────────────────────────────────────────────────────────
    // 11. SALARY INFO IN REJECTED JOBS (from raw_data)
    // ───────────────────────────────────────────────────────────────────
    section('11. SALARY INFO IN REJECTED JOBS');

    try {
        const withSalary = await client.query(`
      SELECT COUNT(*) as cnt FROM rejected_jobs
      WHERE raw_data IS NOT NULL
        AND (raw_data->>'salaryRange' IS NOT NULL
         OR raw_data->>'minSalary' IS NOT NULL
         OR raw_data->>'salary_range' IS NOT NULL
         OR raw_data->>'min_salary' IS NOT NULL)
    `);
        log(`  Rejected jobs with salary data in raw_data: ${withSalary.rows[0].cnt}`);

        const salSamples = await client.query(`
      SELECT title, employer, source_provider,
             raw_data->>'salaryRange' as salary_range,
             raw_data->>'minSalary' as min_sal,
             raw_data->>'maxSalary' as max_sal,
             raw_data->>'salary_range' as salary_range2,
             raw_data->>'min_salary' as min_sal2,
             raw_data->>'max_salary' as max_sal2
      FROM rejected_jobs
      WHERE raw_data IS NOT NULL
        AND (raw_data->>'salaryRange' IS NOT NULL
         OR raw_data->>'minSalary' IS NOT NULL
         OR raw_data->>'salary_range' IS NOT NULL
         OR raw_data->>'min_salary' IS NOT NULL)
      LIMIT 10
    `);
        if (salSamples.rows.length > 0) {
            log(`\n  Salary samples from rejected jobs:`);
            for (const r of salSamples.rows) {
                const sal = r.salary_range || r.salary_range2 || `${r.min_sal || r.min_sal2} - ${r.max_sal || r.max_sal2}`;
                log(`    [${r.source_provider}] "${r.title}" — ${r.employer || 'unknown'} | Salary: ${sal}`);
            }
        }
    } catch {
        log(`  ⚠️ Could not parse salary from raw_data.`);
    }

    // ───────────────────────────────────────────────────────────────────
    // 12. DUPLICATE CHECK — are rejected jobs already in accepted?
    // ───────────────────────────────────────────────────────────────────
    section('12. OVERLAP CHECK — Rejected jobs that exist in accepted');

    const overlap = await client.query(`
    SELECT COUNT(*) as cnt FROM rejected_jobs r
    WHERE EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.is_published = true
        AND j.external_id = r.external_id
        AND j.source_provider = r.source_provider
    )
  `);
    log(`  Rejected jobs with matching accepted external_id: ${overlap.rows[0].cnt}`);

    const noOverlap = await client.query(`
    SELECT COUNT(*) as cnt FROM rejected_jobs r
    WHERE r.external_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM jobs j
        WHERE j.external_id = r.external_id
          AND j.source_provider = r.source_provider
      )
  `);
    log(`  Rejected jobs NOT in accepted (unique to rejected): ${noOverlap.rows[0].cnt}`);

    // ───────────────────────────────────────────────────────────────────
    // 13. RECOVERABILITY SUMMARY
    // ───────────────────────────────────────────────────────────────────
    section('13. RECOVERABILITY ASSESSMENT');

    log(`  Total rejected:                ${total.rows[0].cnt}`);
    log(`  PMHNP-relevant rejected:       ${pmhnpRejected.rows[0].cnt} (${Math.round(parseInt(pmhnpRejected.rows[0].cnt) / parseInt(total.rows[0].cnt) * 100)}%)`);
    log(`  Already in accepted DB:        ${overlap.rows[0].cnt}`);

    // Recoverable = PMHNP-relevant AND NOT already in accepted
    const recoverable = await client.query(`
    SELECT COUNT(*) as cnt FROM rejected_jobs r
    WHERE (LOWER(title) LIKE '%pmhnp%'
       OR LOWER(title) LIKE '%psychiatric nurse%'
       OR LOWER(title) LIKE '%psychiatric mental health%'
       OR LOWER(title) LIKE '%psych np%'
       OR LOWER(title) LIKE '%psychiatric aprn%'
       OR LOWER(title) LIKE '%psychiatric arnp%'
       OR LOWER(title) LIKE '%mental health np%'
       OR LOWER(title) LIKE '%psychiatric prescriber%'
       OR LOWER(title) LIKE '%psych nurse practitioner%'
       OR LOWER(title) LIKE '%mental health nurse practitioner%'
       OR LOWER(title) LIKE '%psychiatric%nurse%'
       OR LOWER(title) LIKE '%psychiatry nurse practitioner%')
    AND NOT EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.external_id = r.external_id
        AND j.source_provider = r.source_provider
        AND j.is_published = true
    )
  `);
    log(`  ⭐ RECOVERABLE (PMHNP + not in DB): ${recoverable.rows[0].cnt}`);

    // Recoverable breakdown by source
    const recBySource = await client.query(`
    SELECT r.source_provider, COUNT(*) as cnt FROM rejected_jobs r
    WHERE (LOWER(title) LIKE '%pmhnp%'
       OR LOWER(title) LIKE '%psychiatric nurse%'
       OR LOWER(title) LIKE '%psychiatric mental health%'
       OR LOWER(title) LIKE '%psych np%'
       OR LOWER(title) LIKE '%psychiatric aprn%'
       OR LOWER(title) LIKE '%psychiatric arnp%'
       OR LOWER(title) LIKE '%mental health np%'
       OR LOWER(title) LIKE '%psychiatric prescriber%'
       OR LOWER(title) LIKE '%psych nurse practitioner%'
       OR LOWER(title) LIKE '%mental health nurse practitioner%'
       OR LOWER(title) LIKE '%psychiatric%nurse%'
       OR LOWER(title) LIKE '%psychiatry nurse practitioner%')
    AND NOT EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.external_id = r.external_id
        AND j.source_provider = r.source_provider
        AND j.is_published = true
    )
    GROUP BY r.source_provider ORDER BY cnt DESC
  `);
    if (recBySource.rows.length > 0) {
        log(`\n  Recoverable by source:`);
        for (const r of recBySource.rows) {
            log(`    ${(r.source_provider || 'null').padEnd(22)} ${r.cnt} jobs could be recovered`);
        }
    }

    // ───────────────────────────────────────────────────────────────────
    section('ANALYSIS COMPLETE');

    client.release();
    await pool.end();

    const reportPath = 'scripts/rejected-jobs-analysis.txt';
    fs.writeFileSync(reportPath, out.join('\n'), 'utf8');
    console.log(`\n📄 Full report saved: ${reportPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
