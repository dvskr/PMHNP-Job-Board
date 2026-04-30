/**
 * Source-presence threshold tuning analysis.
 *
 * The auto-unpublish cron flips jobs whose `health_consecutive_missing >= N`
 * to `is_published=false`. N is currently 3 (default in
 * `app/api/cron/source-presence-unpublish/route.ts`, override via
 * `JOB_HEALTH_MIN_PRESENCE_MISSES`).
 *
 * That number was a guess at ship time. Now that the audit table has been
 * accumulating real data, we can cross-validate: among jobs that reached
 * each presence-miss bucket, what fraction had an HTTP probe confirming
 * they were dead vs alive? The right threshold is the lowest N where
 * dead-confirmed rate >> alive-confirmed rate (i.e. high precision).
 *
 * Read-only — no DB writes. Outputs to stdout + a tmp JSON snapshot.
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register --project scripts/tsconfig.json \
 *     scripts/tune-presence-threshold.ts
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import * as fs from 'fs';

const REPORT_PATH = '.tmp_presence_threshold_analysis.json';

const DEAD_HTTP_OUTCOMES = new Set([
    'http_404',
    'http_410',
    'soft_404',
    'greenhouse_api_404',
]);
const ALIVE_HTTP_OUTCOMES = new Set([
    'alive_2xx',
    'alive_greenhouse_api',
]);

const BUCKETS: Array<{ label: string; min: number; max: number }> = [
    { label: '0', min: 0, max: 0 },
    { label: '1', min: 1, max: 1 },
    { label: '2', min: 2, max: 2 },
    { label: '3', min: 3, max: 3 },
    { label: '4', min: 4, max: 4 },
    { label: '5+', min: 5, max: Number.MAX_SAFE_INTEGER },
];

interface BucketStats {
    label: string;
    totalJobs: number;
    deadConfirmed: number;
    aliveConfirmed: number;
    inconclusive: number;
    noProbe: number;
    deadRatePct: number;
    aliveRatePct: number;
}

interface ThresholdProposal {
    threshold: number;
    catalogFlipped: number;
    catalogFlippedPct: number;
    deadConfirmed: number;
    aliveConfirmed: number;
    inconclusive: number;
    noProbe: number;
    precisionPct: number; // dead / (dead + alive), excluding unknowns
    coveragePct: number;  // (dead+alive) / total above threshold
}

interface AnalysisReport {
    generatedAt: string;
    catalogTotalPublished: number;
    catalogWithPresenceData: number;
    bySource: Record<string, { total: number; bucketCounts: Record<string, number> }>;
    bucketStats: BucketStats[];
    proposals: ThresholdProposal[];
    currentThreshold: number;
    flippedAtCurrent: { count: number; sample: Array<{ id: string; title: string; sourceProvider: string | null; missing: number }> };
}

function pct(num: number, denom: number): number {
    if (denom === 0) return 0;
    return Math.round((num / denom) * 1000) / 10;
}

async function loadCohort(): Promise<{
    rows: Array<{
        id: string;
        sourceProvider: string | null;
        healthConsecutiveMissing: number;
        isPublished: boolean;
        title: string;
        lastHttpOutcome: string | null;
    }>;
    totalPublished: number;
}> {
    // Pull all currently-published jobs (the population the cron acts on).
    // ~8k rows — fits in memory.
    const totalPublished = await prisma.job.count({ where: { isPublished: true } });

    const jobs = await prisma.job.findMany({
        where: { isPublished: true },
        select: {
            id: true,
            sourceProvider: true,
            healthConsecutiveMissing: true,
            isPublished: true,
            title: true,
        },
    });

    // For each job, get the most recent HTTP-style probe outcome (last 30d).
    // Done via groupBy + a follow-up findMany, batched.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const lastChecks = await prisma.jobHealthCheck.findMany({
        where: {
            jobId: { in: jobs.map((j) => j.id) },
            checkedAt: { gte: thirtyDaysAgo },
            checkType: { in: ['http_probe', 'greenhouse_api'] },
        },
        select: { jobId: true, outcome: true, checkedAt: true },
        orderBy: { checkedAt: 'desc' },
    });

    const lastByJob = new Map<string, string>();
    for (const c of lastChecks) {
        if (!lastByJob.has(c.jobId)) lastByJob.set(c.jobId, c.outcome);
    }

    return {
        rows: jobs.map((j) => ({
            ...j,
            lastHttpOutcome: lastByJob.get(j.id) ?? null,
        })),
        totalPublished,
    };
}

function classify(outcome: string | null): 'dead' | 'alive' | 'inconclusive' | 'noProbe' {
    if (!outcome) return 'noProbe';
    if (DEAD_HTTP_OUTCOMES.has(outcome)) return 'dead';
    if (ALIVE_HTTP_OUTCOMES.has(outcome)) return 'alive';
    return 'inconclusive';
}

function bucketize(n: number): string {
    for (const b of BUCKETS) {
        if (n >= b.min && n <= b.max) return b.label;
    }
    return 'unknown';
}

async function diagnose(): Promise<void> {
    console.log('═'.repeat(80));
    console.log('DIAGNOSTIC: is the source-presence pipeline actually firing?');
    console.log('═'.repeat(80));

    const presenceChecks = await prisma.jobHealthCheck.count({
        where: { checkType: 'source_presence' },
    });
    const presenceRecent = await prisma.jobHealthCheck.count({
        where: {
            checkType: 'source_presence',
            checkedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
    });
    const lastPresence = await prisma.jobHealthCheck.findFirst({
        where: { checkType: 'source_presence' },
        orderBy: { checkedAt: 'desc' },
        select: { checkedAt: true, outcome: true, presenceSource: true },
    });

    const flippedByPresence = await prisma.jobHealthCheck.count({
        where: { outcome: 'missing_from_source' },
    });

    const unpublishedHighMiss = await prisma.job.count({
        where: { isPublished: false, healthConsecutiveMissing: { gte: 3 } },
    });
    const allWithMisses = await prisma.job.count({
        where: { healthConsecutiveMissing: { gt: 0 } },
    });

    console.log(`  source_presence rows in audit table: ${presenceChecks}`);
    console.log(`  source_presence rows last 7d: ${presenceRecent}`);
    console.log(`  Last source_presence row: ${lastPresence ? `${lastPresence.checkedAt.toISOString()} — ${lastPresence.presenceSource} → ${lastPresence.outcome}` : 'NONE'}`);
    console.log(`  Rows with outcome=missing_from_source: ${flippedByPresence}`);
    console.log(`  Jobs with consecutive_missing > 0 (any pub state): ${allWithMisses}`);
    console.log(`  Unpublished jobs with consecutive_missing >= 3: ${unpublishedHighMiss}\n`);
}

async function main(): Promise<void> {
    await diagnose();

    console.log('Loading cohort...');
    const { rows, totalPublished } = await loadCohort();
    console.log(
        `  ${totalPublished} published jobs, ${rows.filter((r) => r.healthConsecutiveMissing > 0).length} with presence misses\n`,
    );

    // Per-bucket cross-validation against HTTP probes.
    const bucketStats: BucketStats[] = BUCKETS.map((b) => ({
        label: b.label,
        totalJobs: 0,
        deadConfirmed: 0,
        aliveConfirmed: 0,
        inconclusive: 0,
        noProbe: 0,
        deadRatePct: 0,
        aliveRatePct: 0,
    }));
    const bySource: Record<string, { total: number; bucketCounts: Record<string, number> }> = {};

    for (const r of rows) {
        const bucketLabel = bucketize(r.healthConsecutiveMissing);
        const bs = bucketStats.find((s) => s.label === bucketLabel);
        if (!bs) continue;

        bs.totalJobs++;
        const cls = classify(r.lastHttpOutcome);
        if (cls === 'dead') bs.deadConfirmed++;
        else if (cls === 'alive') bs.aliveConfirmed++;
        else if (cls === 'inconclusive') bs.inconclusive++;
        else bs.noProbe++;

        const src = r.sourceProvider ?? 'unknown';
        if (!bySource[src]) bySource[src] = { total: 0, bucketCounts: {} };
        bySource[src].total++;
        bySource[src].bucketCounts[bucketLabel] =
            (bySource[src].bucketCounts[bucketLabel] ?? 0) + 1;
    }

    for (const bs of bucketStats) {
        bs.deadRatePct = pct(bs.deadConfirmed, bs.totalJobs);
        bs.aliveRatePct = pct(bs.aliveConfirmed, bs.totalJobs);
    }

    // Proposals: simulate flipping at thresholds 2, 3, 4, 5.
    const proposals: ThresholdProposal[] = [];
    for (const threshold of [2, 3, 4, 5]) {
        const above = rows.filter((r) => r.healthConsecutiveMissing >= threshold);
        const dead = above.filter((r) => classify(r.lastHttpOutcome) === 'dead').length;
        const alive = above.filter((r) => classify(r.lastHttpOutcome) === 'alive').length;
        const inc = above.filter((r) => classify(r.lastHttpOutcome) === 'inconclusive').length;
        const np = above.filter((r) => classify(r.lastHttpOutcome) === 'noProbe').length;
        proposals.push({
            threshold,
            catalogFlipped: above.length,
            catalogFlippedPct: pct(above.length, totalPublished),
            deadConfirmed: dead,
            aliveConfirmed: alive,
            inconclusive: inc,
            noProbe: np,
            precisionPct: pct(dead, dead + alive),
            coveragePct: pct(dead + alive, above.length),
        });
    }

    const currentThreshold = parseInt(process.env.JOB_HEALTH_MIN_PRESENCE_MISSES ?? '3', 10);
    const flippedAtCurrent = rows.filter(
        (r) => r.healthConsecutiveMissing >= currentThreshold,
    );

    const report: AnalysisReport = {
        generatedAt: new Date().toISOString(),
        catalogTotalPublished: totalPublished,
        catalogWithPresenceData: rows.filter((r) => r.healthConsecutiveMissing > 0).length,
        bySource,
        bucketStats,
        proposals,
        currentThreshold,
        flippedAtCurrent: {
            count: flippedAtCurrent.length,
            sample: flippedAtCurrent.slice(0, 10).map((r) => ({
                id: r.id,
                title: r.title,
                sourceProvider: r.sourceProvider,
                missing: r.healthConsecutiveMissing,
            })),
        },
    };

    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    // Console output
    console.log('═'.repeat(80));
    console.log('Source-Presence Threshold Tuning Analysis');
    console.log('═'.repeat(80));
    console.log(`Generated: ${report.generatedAt}`);
    console.log(`Catalog (published): ${totalPublished}`);
    console.log(`Jobs with presence misses: ${report.catalogWithPresenceData}`);
    console.log(`Current threshold: ${currentThreshold}\n`);

    console.log('Per-bucket cross-validation:');
    console.log(
        '  Bucket | Jobs   | Dead-confirmed | Alive-confirmed | Inconcl | NoProbe | Dead% | Alive%',
    );
    for (const bs of bucketStats) {
        console.log(
            `  ${bs.label.padEnd(6)} | ${String(bs.totalJobs).padEnd(6)} | ${String(bs.deadConfirmed).padEnd(14)} | ${String(bs.aliveConfirmed).padEnd(15)} | ${String(bs.inconclusive).padEnd(7)} | ${String(bs.noProbe).padEnd(7)} | ${String(bs.deadRatePct).padEnd(5)}% | ${bs.aliveRatePct}%`,
        );
    }
    console.log();

    console.log('Threshold proposals (precision = dead / (dead+alive), excluding unknowns):');
    console.log(
        '  N | Would flip | % catalog | Dead | Alive | Inconcl | NoProbe | Precision | Coverage',
    );
    for (const p of proposals) {
        console.log(
            `  ${p.threshold} | ${String(p.catalogFlipped).padEnd(10)} | ${String(p.catalogFlippedPct).padEnd(9)}% | ${String(p.deadConfirmed).padEnd(4)} | ${String(p.aliveConfirmed).padEnd(5)} | ${String(p.inconclusive).padEnd(7)} | ${String(p.noProbe).padEnd(7)} | ${String(p.precisionPct).padEnd(8)}% | ${p.coveragePct}%`,
        );
    }
    console.log();

    console.log(`At current threshold ${currentThreshold}, ${flippedAtCurrent.length} jobs would be flipped.`);
    console.log(`Full report written to ${REPORT_PATH}`);

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Analysis failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
