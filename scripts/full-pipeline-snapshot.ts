/**
 * Single-shot end-to-end pipeline snapshot. Read-only.
 * Pulls everything needed for a fresh architectural analysis post-cleanups.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';

async function main(): Promise<void> {
    const now = new Date();
    const day = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const month = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    console.log(`Snapshot @ ${now.toISOString()}\n`);

    // 1. Catalog top-line
    const totals = {
        total: await prisma.job.count(),
        published: await prisma.job.count({ where: { isPublished: true } }),
        unpublished: await prisma.job.count({ where: { isPublished: false } }),
        manuallyUnpublished: await prisma.job.count({ where: { isManuallyUnpublished: true } }),
        publishedDirectEmployer: await prisma.job.count({ where: { isPublished: true, sourceType: 'employer' } }),
        publishedExternal: await prisma.job.count({ where: { isPublished: true, sourceType: 'external' } }),
    };
    console.log('CATALOG:');
    for (const [k, v] of Object.entries(totals)) console.log(`  ${k.padEnd(28)} ${v}`);
    console.log();

    // 2. Per-source published + avg quality
    const bySource = await prisma.job.groupBy({
        by: ['sourceProvider'],
        where: { isPublished: true },
        _count: { _all: true },
        _avg: { qualityScore: true },
    });
    console.log('PUBLISHED BY SOURCE:');
    for (const s of bySource.sort((a, b) => b._count._all - a._count._all)) {
        console.log(
            `  ${(s.sourceProvider ?? 'unknown').padEnd(20)} ${s._count._all.toString().padStart(5)}  avgQ=${(s._avg.qualityScore ?? 0).toFixed(1)}`,
        );
    }
    console.log();

    // 3. Source velocity (last 7d)
    const stats = await prisma.sourceStats.groupBy({
        by: ['source'],
        where: { date: { gte: week } },
        _sum: { jobsFetched: true, jobsAdded: true },
    });
    console.log('SOURCE VELOCITY (last 7d):');
    for (const s of stats.sort((a, b) => (b._sum.jobsAdded ?? 0) - (a._sum.jobsAdded ?? 0))) {
        const fetched = s._sum.jobsFetched ?? 0;
        const added = s._sum.jobsAdded ?? 0;
        const rate = fetched > 0 ? ((added / fetched) * 100).toFixed(2) : '0';
        console.log(`  ${s.source.padEnd(20)} fetched=${fetched.toString().padStart(7)}  added=${added.toString().padStart(5)}  rate=${rate}%`);
    }
    console.log();

    // 4. Mode + jobType taxonomy (post-cleanup)
    console.log('MODE (published):');
    const modes = await prisma.job.groupBy({
        by: ['mode'],
        where: { isPublished: true },
        _count: { _all: true },
    });
    for (const m of modes.sort((a, b) => b._count._all - a._count._all)) {
        console.log(`  ${(m.mode ?? '(null)').padEnd(15)} ${m._count._all}`);
    }

    console.log('\nJOB TYPE (published):');
    const types = await prisma.job.groupBy({
        by: ['jobType'],
        where: { isPublished: true },
        _count: { _all: true },
    });
    for (const t of types.sort((a, b) => b._count._all - a._count._all)) {
        console.log(`  ${(t.jobType ?? '(null)').padEnd(15)} ${t._count._all}`);
    }
    console.log();

    // 5. Salary coverage (published)
    const totalPub = totals.published;
    const withNormalized = await prisma.job.count({
        where: { isPublished: true, normalizedMinSalary: { not: null } },
    });
    const lowOutliers = await prisma.job.count({
        where: { isPublished: true, normalizedMinSalary: { gt: 0, lt: 50_000 } },
    });
    console.log('SALARY COVERAGE (published):');
    console.log(`  withNormalizedSalary  ${withNormalized}/${totalPub} (${((withNormalized / totalPub) * 100).toFixed(1)}%)`);
    console.log(`  lowOutliers (<$50k)   ${lowOutliers}`);
    console.log();

    // 6. Quality score distribution (published)
    console.log('QUALITY SCORE BUCKETS (published):');
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
        const pct = ((c / totalPub) * 100).toFixed(1);
        console.log(`  ${b.l.padEnd(8)} ${c.toString().padStart(5)}  (${pct}%)`);
    }
    console.log();

    // 7. Age distribution
    console.log('AGE DISTRIBUTION (published, by original_posted_at):');
    const ageBuckets = [
        { l: '< 3 d',     d: 3 },
        { l: '3-7 d',     d: 7 },
        { l: '7-14 d',    d: 14 },
        { l: '14-45 d',   d: 45 },
        { l: '> 45 d',    d: 365 },
    ];
    let prev = 0;
    for (const b of ageBuckets) {
        const since = new Date(now.getTime() - b.d * 24 * 60 * 60 * 1000);
        const before = new Date(now.getTime() - prev * 24 * 60 * 60 * 1000);
        const c = await prisma.job.count({
            where: {
                isPublished: true,
                originalPostedAt: prev === 0 ? { gte: since } : { gte: since, lt: before },
            },
        });
        console.log(`  ${b.l.padEnd(10)} ${c}`);
        prev = b.d;
    }
    const noPosted = await prisma.job.count({
        where: { isPublished: true, originalPostedAt: null },
    });
    console.log(`  no original_posted_at  ${noPosted}`);
    console.log();

    // 8. Health + audit table
    console.log('JOB HEALTH AUDIT TABLE:');
    const totalAudit = await prisma.jobHealthCheck.count();
    const audit24h = await prisma.jobHealthCheck.count({ where: { checkedAt: { gte: day } } });
    const audit7d = await prisma.jobHealthCheck.count({ where: { checkedAt: { gte: week } } });
    console.log(`  total rows          ${totalAudit}`);
    console.log(`  rows in last 24h    ${audit24h}`);
    console.log(`  rows in last 7d     ${audit7d}`);

    const byCheckType = await prisma.jobHealthCheck.groupBy({
        by: ['checkType'],
        where: { checkedAt: { gte: day } },
        _count: { _all: true },
    });
    console.log('  by check_type (24h):');
    for (const c of byCheckType) console.log(`    ${c.checkType.padEnd(20)} ${c._count._all}`);

    const presence = {
        anyMisses: await prisma.job.count({ where: { healthConsecutiveMissing: { gt: 0 } } }),
        deadSuspected: await prisma.job.count({ where: { healthConsecutiveMissing: { gte: 3 } } }),
    };
    console.log(`  presence: jobs with consecutive_missing > 0  ${presence.anyMisses}`);
    console.log(`  presence: dead-suspected (>=3 misses)        ${presence.deadSuspected}`);
    console.log();

    // 9. Companies
    const companies = await prisma.company.count();
    const verified = await prisma.company.count({ where: { isVerified: true } });
    console.log('COMPANIES:');
    console.log(`  total Company rows   ${companies}`);
    console.log(`  verified (KNOWN)     ${verified}`);
    console.log();

    // 10. Expiry health
    console.log('EXPIRY (published):');
    const expSoon = await prisma.job.count({
        where: { isPublished: true, expiresAt: { lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) } },
    });
    const expFar = await prisma.job.count({
        where: { isPublished: true, expiresAt: { gt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) } },
    });
    console.log(`  expires <= 7 d   ${expSoon}`);
    console.log(`  expires > 30 d   ${expFar}`);

    // 11. Unpublished churn last 30d
    console.log();
    console.log('UNPUBLISHED CHURN:');
    const lastDay = await prisma.job.count({ where: { isPublished: false, isManuallyUnpublished: false, updatedAt: { gte: day } } });
    const lastWeek = await prisma.job.count({ where: { isPublished: false, isManuallyUnpublished: false, updatedAt: { gte: week } } });
    const lastMonth = await prisma.job.count({ where: { isPublished: false, isManuallyUnpublished: false, updatedAt: { gte: month } } });
    console.log(`  unpublished last 24h   ${lastDay}`);
    console.log(`  unpublished last 7d    ${lastWeek}`);
    console.log(`  unpublished last 30d   ${lastMonth}`);

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Snapshot failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
