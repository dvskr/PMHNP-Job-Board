/**
 * Report cron-tracked API usage by source over a date window.
 *
 * Reads cron_runs.metrics.apiCallsBySource and sums per source. Today
 * only fantastic-jobs-db reports a count (RapidAPI 20k Ultra quota);
 * other sources will appear here automatically if they ever start
 * surfacing apiCallsUsed on IngestionResult.
 *
 * Usage:
 *   npx tsx scripts/api-usage-report.ts            # last 7 days (default)
 *   npx tsx scripts/api-usage-report.ts --days 30  # last 30 days
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

const daysIdx = process.argv.indexOf('--days');
const DAYS = daysIdx > -1 && process.argv[daysIdx + 1] ? parseInt(process.argv[daysIdx + 1], 10) : 7;

async function main() {
    const { prisma } = await import('@/lib/prisma');

    console.log(`\n--- API USAGE — LAST ${DAYS} DAYS ---\n`);

    const rows = await prisma.cronRun.findMany({
        where: {
            name: 'ingest',
            startedAt: { gte: new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000) },
            metrics: { not: undefined },
        },
        select: { startedAt: true, metrics: true, success: true },
        orderBy: { startedAt: 'asc' },
    });

    if (rows.length === 0) {
        console.log('No tracked ingest runs in cron_runs for this window.');
        console.log('(withCronTracking only fires for crons hit via the route handler — local script runs are not tracked.)');
        await prisma.$disconnect();
        return;
    }

    const bySource = new Map<string, { calls: number; runs: number }>();
    for (const r of rows) {
        const m = r.metrics as { apiCallsBySource?: Record<string, number> } | null;
        if (!m?.apiCallsBySource) continue;
        for (const [src, calls] of Object.entries(m.apiCallsBySource)) {
            const cur = bySource.get(src) ?? { calls: 0, runs: 0 };
            cur.calls += Number(calls) || 0;
            cur.runs += 1;
            bySource.set(src, cur);
        }
    }

    if (bySource.size === 0) {
        console.log('Tracked ingest runs found but none reported apiCallsBySource yet.');
        console.log('(Likely from before the 2026-05-06 tracking change; older runs predate the metric.)');
    } else {
        console.log(`Found ${rows.length} tracked ingest runs.\n`);
        console.log('source                 runs  calls    avg/run');
        for (const [src, c] of [...bySource.entries()].sort((a, b) => b[1].calls - a[1].calls)) {
            const avg = c.runs > 0 ? (c.calls / c.runs).toFixed(1) : '—';
            console.log(`  ${src.padEnd(20)} ${String(c.runs).padStart(4)}  ${String(c.calls).padStart(5)}  ${avg.padStart(7)}`);
        }

        // Quota projection for sources we know have monthly caps
        const fjd = bySource.get('fantastic-jobs-db');
        if (fjd) {
            const dailyAvg = fjd.calls / DAYS;
            const projectedMonth = Math.round(dailyAvg * 30);
            console.log();
            console.log(`fantastic-jobs-db quota outlook:`);
            console.log(`  ${dailyAvg.toFixed(1)} calls/day average → projected ${projectedMonth}/month`);
            console.log(`  RapidAPI Ultra cap: 20,000/month → ${((projectedMonth / 20000) * 100).toFixed(0)}% utilization`);
        }
    }

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
