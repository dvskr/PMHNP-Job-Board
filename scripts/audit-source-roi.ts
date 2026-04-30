/**
 * 30-day source ROI audit. For each ingestion source: how many jobs did
 * we fetch, add, and how many of those adds are still live + earning
 * views/clicks? Used to decide which sources to keep, kill, or rework.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';

const DAYS = 30;

async function main(): Promise<void> {
    const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

    console.log(`Source ROI audit — last ${DAYS} days (since ${cutoff.toISOString().slice(0, 10)})\n`);
    console.log('source            fetched    added  add_rate%   live  livePub%  views  clicks  CTR%  avgQ');
    console.log('─'.repeat(105));

    // Per-source aggregated source_stats over the window.
    const stats = await prisma.sourceStats.groupBy({
        by: ['source'],
        where: { date: { gte: cutoff } },
        _sum: { jobsFetched: true, jobsAdded: true },
    });

    type Row = {
        source: string;
        fetched: number;
        added: number;
        live: number;
        livePub: number;
        views: number;
        clicks: number;
        avgQ: number;
    };
    const rows: Row[] = [];

    for (const s of stats) {
        const fetched = s._sum.jobsFetched ?? 0;
        const added = s._sum.jobsAdded ?? 0;

        // Of the rows added in the last DAYS days from this source: how many
        // are still published + their engagement.
        const liveJobs = await prisma.job.findMany({
            where: {
                sourceProvider: s.source,
                createdAt: { gte: cutoff },
            },
            select: {
                isPublished: true,
                viewCount: true,
                applyClickCount: true,
                qualityScore: true,
            },
        });
        const live = liveJobs.length;
        const livePub = liveJobs.filter((j) => j.isPublished).length;
        const views = liveJobs.reduce((acc, j) => acc + j.viewCount, 0);
        const clicks = liveJobs.reduce((acc, j) => acc + j.applyClickCount, 0);
        const avgQ = liveJobs.length > 0
            ? liveJobs.reduce((acc, j) => acc + j.qualityScore, 0) / liveJobs.length
            : 0;

        rows.push({ source: s.source, fetched, added, live, livePub, views, clicks, avgQ });
    }

    // Sort by added desc.
    rows.sort((a, b) => b.added - a.added);

    for (const r of rows) {
        const addRate = r.fetched > 0 ? ((r.added / r.fetched) * 100).toFixed(2) : '0';
        const livePubPct = r.live > 0 ? ((r.livePub / r.live) * 100).toFixed(0) : '0';
        const ctr = r.views > 0 ? ((r.clicks / r.views) * 100).toFixed(2) : '0';
        console.log(
            `${r.source.padEnd(18)}` +
            `${r.fetched.toString().padStart(7)}` +
            `${r.added.toString().padStart(8)}` +
            `${addRate.padStart(10)}%` +
            `${r.live.toString().padStart(6)}` +
            `${livePubPct.padStart(8)}%` +
            `${r.views.toString().padStart(7)}` +
            `${r.clicks.toString().padStart(8)}` +
            `${ctr.padStart(6)}%` +
            `${r.avgQ.toFixed(1).padStart(6)}`,
        );
    }

    // Verdict heuristic.
    console.log();
    console.log('Heuristic verdict:');
    for (const r of rows) {
        let verdict = 'KEEP';
        const reasons: string[] = [];
        if (r.added === 0) {
            verdict = 'KILL';
            reasons.push('zero adds in window');
        } else if (r.added < 30 && r.fetched > 1000) {
            verdict = 'KILL';
            reasons.push(`high fetch (${r.fetched}) for trivial adds (${r.added})`);
        } else if (r.added < 30) {
            verdict = 'CUT';
            reasons.push(`only ${r.added} adds in 30d`);
        } else if (r.clicks === 0 && r.added > 50) {
            verdict = 'CUT';
            reasons.push(`${r.added} adds but zero clicks`);
        }
        console.log(`  ${r.source.padEnd(20)} ${verdict.padEnd(5)}  ${reasons.join('; ')}`);
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Audit failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
