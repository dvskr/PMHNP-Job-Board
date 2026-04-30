/**
 * End-to-end pipeline correctness audit.
 *
 * Verifies every invariant in the architecture we just stabilized:
 *   1. Catalog top-line
 *   2. Time-field consistency (createdAt, originalPostedAt, updatedAt, expiresAt)
 *   3. originalPostedAt-based filter behavior matches the new rule
 *   4. Expiry / renewal / unpublish state machine
 *   5. Source-presence pipeline + audit table flow
 *   6. Mode + jobType taxonomy is clean post-canonicalization
 *   7. PMHNP relevance — sample published titles, look for outliers
 *   8. Rejected-jobs distribution
 *   9. Salary outliers
 *   10. Company normalization spot-check
 *   11. Apply-link health sanity
 *   12. Quality-score distribution
 *
 * Read-only. Run anytime to verify pipeline health.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';

const PMHNP_RELEVANCE_TERMS = [
    'pmhnp', 'psychiatric', 'mental health', 'behavioral health',
    'psych', 'psychiatry', 'telepsych', 'aprn',
];

function pct(n: number, d: number): string {
    if (d === 0) return '0%';
    return `${((n / d) * 100).toFixed(1)}%`;
}
function header(title: string): void {
    console.log('\n' + '═'.repeat(78));
    console.log(`▶ ${title}`);
    console.log('═'.repeat(78));
}
function checkmark(pass: boolean): string {
    return pass ? '✓' : '✗';
}

async function main(): Promise<void> {
    const now = new Date();
    const day = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const month = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    console.log(`PMHNP Job Board — End-to-End Pipeline Audit`);
    console.log(`Generated: ${now.toISOString()}`);

    // ═══ 1. CATALOG TOP-LINE ═══════════════════════════════════════════
    header('1. Catalog top-line');
    const total = await prisma.job.count();
    const published = await prisma.job.count({ where: { isPublished: true } });
    const unpublished = total - published;
    const manuallyUnpublished = await prisma.job.count({ where: { isManuallyUnpublished: true } });
    const directEmployer = await prisma.job.count({ where: { isPublished: true, sourceType: 'employer' } });
    const aggregated = await prisma.job.count({ where: { isPublished: true, sourceType: 'external' } });
    console.log(`Total rows ............ ${total}`);
    console.log(`Published ............. ${published} (${pct(published, total)})`);
    console.log(`  Direct employer ..... ${directEmployer}`);
    console.log(`  Aggregated .......... ${aggregated}`);
    console.log(`Unpublished ........... ${unpublished}`);
    console.log(`Manually unpublished .. ${manuallyUnpublished}`);

    // ═══ 2. TIME FIELD CONSISTENCY ═══════════════════════════════════════
    header('2. Time-field consistency');
    const nullPosted = await prisma.job.count({ where: { originalPostedAt: null } });
    const nullPostedPub = await prisma.job.count({ where: { originalPostedAt: null, isPublished: true } });
    console.log(`originalPostedAt = NULL (any state) ........ ${nullPosted} ${checkmark(nullPosted === 0)}`);
    console.log(`originalPostedAt = NULL (published) ........ ${nullPostedPub} ${checkmark(nullPostedPub === 0)}`);

    const futurePosted = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM jobs WHERE original_posted_at > NOW()
    `;
    console.log(`originalPostedAt in future (logic error) .. ${futurePosted[0]?.n} ${checkmark(Number(futurePosted[0]?.n) === 0)}`);

    const postedAfterCreated = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM jobs WHERE original_posted_at > created_at + INTERVAL '1 day'
    `;
    console.log(`originalPostedAt > createdAt + 1d (impossible) .. ${postedAfterCreated[0]?.n} ${checkmark(Number(postedAfterCreated[0]?.n) === 0)}`);

    // Pipeline lag
    const lagStats = await prisma.$queryRaw<{ avg_hours: number; p50_hours: number; p95_hours: number }[]>`
        SELECT
          AVG(EXTRACT(EPOCH FROM (created_at - original_posted_at)) / 3600) AS avg_hours,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (created_at - original_posted_at)) / 3600) AS p50_hours,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (created_at - original_posted_at)) / 3600) AS p95_hours
        FROM jobs
        WHERE is_published = true
          AND original_posted_at IS NOT NULL
          AND created_at >= original_posted_at
    `;
    const lag = lagStats[0];
    console.log(`Pipeline lag (created - posted, published rows):`);
    console.log(`  avg = ${lag?.avg_hours?.toFixed(1)}h, p50 = ${lag?.p50_hours?.toFixed(1)}h, p95 = ${lag?.p95_hours?.toFixed(1)}h`);

    // ═══ 3. FILTER BEHAVIOR VALIDATION ═══════════════════════════════════
    header('3. Filter behavior — originalPostedAt vs createdAt');
    const last24hByOriginal = await prisma.job.count({
        where: { isPublished: true, originalPostedAt: { gte: day } },
    });
    const last24hByCreated = await prisma.job.count({
        where: { isPublished: true, createdAt: { gte: day } },
    });
    const last7dByOriginal = await prisma.job.count({
        where: { isPublished: true, originalPostedAt: { gte: week } },
    });
    const last7dByCreated = await prisma.job.count({
        where: { isPublished: true, createdAt: { gte: week } },
    });
    console.log(`"Last 24h" filter (originalPostedAt) ..... ${last24hByOriginal}`);
    console.log(`"Last 24h" by createdAt (legacy) ......... ${last24hByCreated}`);
    console.log(`"Last 7d" filter (originalPostedAt) ...... ${last7dByOriginal}`);
    console.log(`"Last 7d" by createdAt (legacy) .......... ${last7dByCreated}`);
    console.log(`Diff (24h) — backfill / fast-cron drift: ${last24hByCreated - last24hByOriginal}`);

    // ═══ 4. AGE DISTRIBUTION (originalPostedAt) ═══════════════════════════
    header('4. Age distribution by originalPostedAt (published)');
    const ageBuckets = [
        { l: '< 3 d  (Fresh)',    cap: 3 },
        { l: '3-7 d  (Recent)',   cap: 7 },
        { l: '7-14 d (Normal)',   cap: 14 },
        { l: '14-45d (Aging)',    cap: 45 },
        { l: '45-90d',            cap: 90 },
        { l: '> 90 d (Stale)',    cap: 365 * 5 },
    ];
    let prev = 0;
    for (const b of ageBuckets) {
        const cutoffNew = new Date(now.getTime() - prev * 24 * 60 * 60 * 1000);
        const cutoffOld = new Date(now.getTime() - b.cap * 24 * 60 * 60 * 1000);
        const c = await prisma.job.count({
            where: {
                isPublished: true,
                originalPostedAt: { lt: cutoffNew, gte: cutoffOld },
            },
        });
        console.log(`  ${b.l.padEnd(20)} ${c.toString().padStart(5)}  (${pct(c, published)})`);
        prev = b.cap;
    }
    const over90 = await prisma.job.count({
        where: { isPublished: true, originalPostedAt: { lt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) } },
    });
    console.log(`  Over 90 d (rejected by normalizer for non-ATS, but ATS sources allow): ${over90}`);

    // ═══ 5. EXPIRY / RENEWAL / UNPUBLISH STATE MACHINE ═══════════════════
    header('5. Expiry & renewal state machine');
    const pastExpired = await prisma.job.count({
        where: { isPublished: true, expiresAt: { lt: now } },
    });
    const expWithin7d = await prisma.job.count({
        where: { isPublished: true, expiresAt: { lt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) } },
    });
    const expWithin30d = await prisma.job.count({
        where: { isPublished: true, expiresAt: { lt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) } },
    });
    const noExpiry = await prisma.job.count({
        where: { isPublished: true, expiresAt: null },
    });
    console.log(`Published rows past expires_at (BUG if > 0) .. ${pastExpired} ${checkmark(pastExpired === 0)}`);
    console.log(`Expires within 7 days  ........................ ${expWithin7d}`);
    console.log(`Expires within 30 days ........................ ${expWithin30d}`);
    console.log(`No expires_at set on published row (BUG if > 0) ${noExpiry} ${checkmark(noExpiry === 0)}`);

    const renewalAge = await prisma.$queryRaw<{ p50: number; p95: number; oldest: number }[]>`
        SELECT
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (NOW() - updated_at)) / 86400) AS p50,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (NOW() - updated_at)) / 86400) AS p95,
          MAX(EXTRACT(EPOCH FROM (NOW() - updated_at)) / 86400) AS oldest
        FROM jobs WHERE is_published = true
    `;
    const r = renewalAge[0];
    console.log(`Days since last renewal (published): p50=${r?.p50?.toFixed(1)}d  p95=${r?.p95?.toFixed(1)}d  max=${r?.oldest?.toFixed(1)}d`);
    console.log(`  → 120-day cap should kick in for max > 120`);
    const over120Renewal = await prisma.job.count({
        where: { isPublished: true, updatedAt: { lt: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000) } },
    });
    console.log(`Published rows un-renewed > 120 days (BUG if > 0): ${over120Renewal} ${checkmark(over120Renewal === 0)}`);

    // ═══ 6. SOURCE-PRESENCE PIPELINE ═══════════════════════════════════════
    header('6. Source-presence pipeline');
    const presence0 = await prisma.job.count({
        where: { isPublished: true, healthConsecutiveMissing: 0 },
    });
    const presence1 = await prisma.job.count({
        where: { isPublished: true, healthConsecutiveMissing: 1 },
    });
    const presence2 = await prisma.job.count({
        where: { isPublished: true, healthConsecutiveMissing: 2 },
    });
    const presenceDanger = await prisma.job.count({
        where: { isPublished: true, healthConsecutiveMissing: { gte: 3 } },
    });
    console.log(`consecutive_missing = 0  (alive) ........ ${presence0}`);
    console.log(`                    = 1  ................ ${presence1}`);
    console.log(`                    = 2  ................ ${presence2}`);
    console.log(`                    >= 3 (dead-suspected) ${presenceDanger}`);
    console.log(`  → next presence-unpublish cron at 12:55 UTC will flip the dead-suspected bucket`);

    // ═══ 7. JOB HEALTH AUDIT TABLE ═══════════════════════════════════════
    header('7. Audit table (job_health_checks)');
    const auditTotal = await prisma.jobHealthCheck.count();
    const audit24h = await prisma.jobHealthCheck.count({ where: { checkedAt: { gte: day } } });
    const audit7d = await prisma.jobHealthCheck.count({ where: { checkedAt: { gte: week } } });
    console.log(`Total audit rows ........... ${auditTotal}`);
    console.log(`Last 24h ................... ${audit24h}`);
    console.log(`Last 7d .................... ${audit7d}`);
    const byCheckType = await prisma.jobHealthCheck.groupBy({
        by: ['checkType'],
        where: { checkedAt: { gte: day } },
        _count: { _all: true },
    });
    console.log(`by check_type (24h):`);
    for (const c of byCheckType) console.log(`  ${c.checkType.padEnd(20)} ${c._count._all}`);

    // ═══ 8. UNPUBLISHED CHURN ═══════════════════════════════════════════
    header('8. Unpublished churn');
    const unp24h = await prisma.job.count({
        where: { isPublished: false, isManuallyUnpublished: false, updatedAt: { gte: day } },
    });
    const unp7d = await prisma.job.count({
        where: { isPublished: false, isManuallyUnpublished: false, updatedAt: { gte: week } },
    });
    const unp30d = await prisma.job.count({
        where: { isPublished: false, isManuallyUnpublished: false, updatedAt: { gte: month } },
    });
    console.log(`Auto-unpublished last 24h .. ${unp24h}`);
    console.log(`Auto-unpublished last 7d ... ${unp7d}`);
    console.log(`Auto-unpublished last 30d .. ${unp30d}`);

    // ═══ 9. MODE + JOB-TYPE TAXONOMY (canonical) ═══════════════════════════
    header('9. Mode + jobType taxonomy (post-canonicalization)');
    const modes = await prisma.job.groupBy({ by: ['mode'], where: { isPublished: true }, _count: { _all: true } });
    console.log('Mode (published):');
    for (const m of modes.sort((a, b) => b._count._all - a._count._all)) {
        const tag = m.mode === null ? '(null)' : m.mode;
        const flag = m.mode && !['Remote', 'Hybrid', 'In-Person', 'Flexible'].includes(m.mode) ? ' ✗ NON-CANONICAL' : '';
        console.log(`  ${tag.padEnd(15)} ${m._count._all}${flag}`);
    }
    const jobTypes = await prisma.job.groupBy({ by: ['jobType'], where: { isPublished: true }, _count: { _all: true } });
    console.log('Job type (published):');
    const canonicalTypes = ['Full-Time', 'Part-Time', 'Contract', 'Per Diem', 'PRN', 'Locum Tenens', 'Internship'];
    for (const t of jobTypes.sort((a, b) => b._count._all - a._count._all)) {
        const tag = t.jobType === null ? '(null)' : t.jobType;
        const flag = t.jobType && !canonicalTypes.includes(t.jobType) ? ' ✗ NON-CANONICAL' : '';
        console.log(`  ${tag.padEnd(15)} ${t._count._all}${flag}`);
    }

    // ═══ 10. PMHNP RELEVANCE SAMPLE ═══════════════════════════════════════
    header('10. PMHNP relevance sample (50 random published titles)');
    const sample = await prisma.$queryRaw<{ title: string; employer: string; source_provider: string }[]>`
        SELECT title, employer, source_provider FROM jobs
        WHERE is_published = true ORDER BY RANDOM() LIMIT 50
    `;
    let suspect = 0;
    for (const j of sample) {
        const t = j.title.toLowerCase();
        const matches = PMHNP_RELEVANCE_TERMS.some((term) => t.includes(term));
        if (!matches) {
            suspect++;
            console.log(`  ✗ "${j.title}" @ ${j.employer} [${j.source_provider}]`);
        }
    }
    console.log(`  ${50 - suspect}/50 titles contain a PMHNP-relevant term`);
    if (suspect > 5) {
        console.log(`  ✗ ${suspect} suspect titles in random sample — relevance filter may be loose`);
    } else {
        console.log(`  ✓ ${suspect} suspect titles (acceptable noise)`);
    }

    // ═══ 11. NON-PMHNP TITLES IN PUBLISHED CATALOG ═══════════════════════
    header('11. Hard-flagged non-PMHNP titles in published catalog');
    const knownNonPmhnp = ['peer specialist', 'medical assistant', 'rn ', 'registered nurse', 'lpn', 'cna ', 'pharmacy', 'phlebotomist', 'security officer', 'janitor', 'food service', 'plumber'];
    let flaggedNonPmhnp: { title: string; employer: string }[] = [];
    for (const term of knownNonPmhnp) {
        const rows = await prisma.job.findMany({
            where: { isPublished: true, title: { contains: term, mode: 'insensitive' } },
            select: { title: true, employer: true },
            take: 5,
        });
        for (const row of rows) flaggedNonPmhnp.push(row);
    }
    if (flaggedNonPmhnp.length === 0) {
        console.log(`  ✓ No obvious non-PMHNP titles in published catalog`);
    } else {
        console.log(`  ✗ Found ${flaggedNonPmhnp.length} non-PMHNP titles:`);
        for (const r of flaggedNonPmhnp.slice(0, 15)) {
            console.log(`     "${r.title}" @ ${r.employer}`);
        }
    }

    // ═══ 12. REJECTED JOBS DISTRIBUTION ═══════════════════════════════════
    header('12. Rejected jobs (last 7 days)');
    const rejBy = await prisma.rejectedJob.groupBy({
        by: ['rejectionReason'],
        where: { createdAt: { gte: week } },
        _count: { _all: true },
        orderBy: { _count: { rejectionReason: 'desc' } },
        take: 15,
    });
    console.log(`Top rejection reasons last 7d:`);
    for (const r of rejBy) console.log(`  ${(r.rejectionReason ?? 'unknown').padEnd(40)} ${r._count._all}`);

    // ═══ 13. SALARY OUTLIERS ═══════════════════════════════════════════════
    header('13. Salary outliers');
    const lowSalary = await prisma.job.count({
        where: { isPublished: true, normalizedMinSalary: { gt: 0, lt: 50_000 } },
    });
    const highSalary = await prisma.job.count({
        where: { isPublished: true, normalizedMaxSalary: { gt: 600_000 } },
    });
    const noSalary = await prisma.job.count({
        where: { isPublished: true, normalizedMinSalary: null },
    });
    console.log(`< $50k normalized min ........ ${lowSalary}`);
    console.log(`> $600k normalized max ....... ${highSalary}`);
    console.log(`No salary data ............... ${noSalary} (${pct(noSalary, published)})`);

    // ═══ 14. COMPANY NORMALIZATION ═══════════════════════════════════════
    header('14. Top employers (look for visible dupes)');
    const topEmp = await prisma.job.groupBy({
        by: ['employer'],
        where: { isPublished: true },
        _count: { _all: true },
        orderBy: { _count: { employer: 'desc' } },
        take: 15,
    });
    for (const e of topEmp) {
        console.log(`  ${e.employer.slice(0, 50).padEnd(50)} ${e._count._all}`);
    }

    // ═══ 15. APPLY-LINK SANITY ═══════════════════════════════════════════
    header('15. Apply-link sanity');
    const noApply = await prisma.job.count({ where: { isPublished: true, applyLink: null } });
    const emptyApply = await prisma.job.count({ where: { isPublished: true, applyLink: '' } });
    console.log(`Published rows with NULL applyLink ... ${noApply}`);
    console.log(`Published rows with empty applyLink .. ${emptyApply}`);

    // ═══ 16. QUALITY DISTRIBUTION ═══════════════════════════════════════════
    header('16. Quality score distribution (published)');
    const qBuckets = [
        { l: '< 20', f: 0, t: 20 },
        { l: '20-40', f: 20, t: 40 },
        { l: '40-60', f: 40, t: 60 },
        { l: '60-80', f: 60, t: 80 },
        { l: '80+', f: 80, t: 999 },
    ];
    for (const b of qBuckets) {
        const c = await prisma.job.count({
            where: { isPublished: true, qualityScore: { gte: b.f, lt: b.t } },
        });
        console.log(`  ${b.l.padEnd(8)} ${c.toString().padStart(5)} (${pct(c, published)})`);
    }

    // ═══ 17. PER-SOURCE HEALTH ═══════════════════════════════════════════
    header('17. Per-source published count + avg quality');
    const bySource = await prisma.job.groupBy({
        by: ['sourceProvider'],
        where: { isPublished: true },
        _count: { _all: true },
        _avg: { qualityScore: true },
    });
    for (const s of bySource.sort((a, b) => b._count._all - a._count._all)) {
        const src = s.sourceProvider ?? 'unknown';
        console.log(`  ${src.padEnd(22)} ${s._count._all.toString().padStart(5)}  avgQ=${(s._avg.qualityScore ?? 0).toFixed(1)}`);
    }

    console.log('\n' + '═'.repeat(78));
    console.log('AUDIT COMPLETE');
    console.log('═'.repeat(78));

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Audit failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
