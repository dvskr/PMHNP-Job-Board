/**
 * Audit quality_score distribution to inform the gate decision.
 * Read-only.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';

async function main(): Promise<void> {
    console.log('Quality-score distribution (published jobs):\n');

    const buckets: { label: string; from: number; to: number }[] = [
        { label: '< 5  (would be gated at threshold 5)', from: 0, to: 5 },
        { label: '5-10', from: 5, to: 10 },
        { label: '10-20', from: 10, to: 20 },
        { label: '20-40', from: 20, to: 40 },
        { label: '40-60', from: 40, to: 60 },
        { label: '60-80', from: 60, to: 80 },
        { label: '80+', from: 80, to: 9999 },
    ];

    const total = await prisma.job.count({ where: { isPublished: true } });
    for (const b of buckets) {
        const count = await prisma.job.count({
            where: {
                isPublished: true,
                qualityScore: { gte: b.from, lt: b.to },
            },
        });
        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
        console.log(`  ${b.label.padEnd(45)} ${count.toString().padStart(6)}  (${pct}%)`);
    }
    console.log(`  ${'TOTAL'.padEnd(45)} ${total.toString().padStart(6)}`);

    // Per-source averages and at-risk-of-gate counts
    console.log();
    console.log('Per-source: published count, avg quality, count <5, count <10:\n');
    const bySource = await prisma.job.groupBy({
        by: ['sourceProvider'],
        where: { isPublished: true },
        _count: { _all: true },
        _avg: { qualityScore: true },
    });
    for (const s of bySource.sort((a, b) => (b._count._all - a._count._all))) {
        const src = s.sourceProvider ?? 'unknown';
        const lt5 = await prisma.job.count({
            where: { isPublished: true, sourceProvider: s.sourceProvider, qualityScore: { lt: 5 } },
        });
        const lt10 = await prisma.job.count({
            where: { isPublished: true, sourceProvider: s.sourceProvider, qualityScore: { lt: 10 } },
        });
        console.log(
            `  ${src.padEnd(20)} ${s._count._all.toString().padStart(5)}  avg=${(s._avg.qualityScore ?? 0).toFixed(1).padStart(5)}  <5: ${lt5.toString().padStart(4)}  <10: ${lt10.toString().padStart(4)}`,
        );
    }

    // Engagement stats by quality bucket — does low quality actually correlate
    // with low view/click rate? If so, the gate has real lift.
    console.log();
    console.log('Engagement by quality bucket (published jobs):\n');
    for (const b of buckets) {
        const rows = await prisma.job.findMany({
            where: {
                isPublished: true,
                qualityScore: { gte: b.from, lt: b.to },
            },
            select: { viewCount: true, applyClickCount: true },
        });
        if (rows.length === 0) continue;
        const totalViews = rows.reduce((acc, r) => acc + r.viewCount, 0);
        const totalClicks = rows.reduce((acc, r) => acc + r.applyClickCount, 0);
        const avgViews = totalViews / rows.length;
        const avgClicks = totalClicks / rows.length;
        const ctr = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;
        console.log(
            `  ${b.label.padEnd(45)}  avgViews=${avgViews.toFixed(1).padStart(6)}  avgClicks=${avgClicks.toFixed(2).padStart(5)}  CTR=${ctr.toFixed(2)}%`,
        );
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Audit failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
