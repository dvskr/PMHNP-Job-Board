/**
 * One-shot full-catalog audit: probe every published external job and
 * unpublish the ones that are verifiably dead.
 *
 * Designed to be SEO-safe by relying on the existing pipeline rather
 * than introducing new behaviour:
 *   - The slug page returns HTTP 410 Gone for unpublished jobs, which
 *     is the canonical "deindex me" signal to Googlebot.
 *   - The existing /api/cron/deindex-expired cron pings Google Indexing
 *     API + IndexNow with URL_DELETED for jobs unpublished in the last
 *     48h — Google's 100/day quota means the catalog gets cleaned up
 *     over ~30 days, not instantly. That gradual deindex is the
 *     SEO-friendly behaviour.
 *
 * Decision policy mirrors the dead-link cron:
 *   - Reject (mark dead) on:  http_404, http_410, greenhouse_api_404,
 *                             soft_404
 *   - Keep alive on:          alive_*, inconclusive_*, anything that
 *                             couldn't probe (network errors, timeouts)
 *
 * Usage:
 *   ts-node --project scripts/tsconfig.json scripts/audit-and-prune-dead-jobs.ts             # dry-run
 *   ts-node --project scripts/tsconfig.json scripts/audit-and-prune-dead-jobs.ts --apply     # actually unpublish
 *   ts-node --project scripts/tsconfig.json scripts/audit-and-prune-dead-jobs.ts --apply --max-unpublish 1000  # cap how many flip per run
 *   ts-node --project scripts/tsconfig.json scripts/audit-and-prune-dead-jobs.ts --source greenhouse           # restrict to one source
 *
 * Output:
 *   .tmp_audit_dead_jobs.json — full per-job decisions for offline analysis
 *
 * Resumable: re-running picks up where it left off as long as the
 * previous run's JSON file is intact (skips jobs already in the file).
 */

// Load .env.prod first so DATABASE_URL points at production. Falls
// back to ambient env if .env.prod is absent.
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import { checkJobHealth, type HealthDecision } from '@/lib/health';
import * as fs from 'fs';

const REPORT_PATH = '.tmp_audit_dead_jobs.json';
const PROBE_GLOBAL_CONCURRENCY = 25;
const PROBE_PER_DOMAIN_CONCURRENCY = 3;
const DB_WRITE_BATCH_SIZE = 250;
const PROGRESS_LOG_EVERY = 100;

const DEAD_REASONS = new Set<HealthDecision['reason']>([
    'http_404',
    'http_410',
    'greenhouse_api_404',
    'soft_404',
]);

interface JobRow {
    id: string;
    applyLink: string | null;
    title: string;
    employer: string;
    sourceProvider: string | null;
    externalId: string | null;
    qualityScore: number;
}

interface JobDecision {
    jobId: string;
    title: string;
    employer: string;
    source: string;
    applyLink: string | null;
    alive: boolean;
    reason: HealthDecision['reason'];
    finalStatus: number | null;
    redirectHops: number;
    softPatternId: string | null;
    elapsedMs: number;
    finalUrl: string;
    decidedAt: string;
}

interface ReportFile {
    startedAt: string;
    decisions: JobDecision[];
}

interface RunArgs {
    apply: boolean;
    maxUnpublish: number;
    sourceFilter: string | null;
}

function parseArgs(): RunArgs {
    const args = process.argv.slice(2);
    const maxIdx = args.indexOf('--max-unpublish');
    const srcIdx = args.indexOf('--source');
    return {
        apply: args.includes('--apply'),
        maxUnpublish:
            maxIdx >= 0 && args[maxIdx + 1]
                ? Math.max(0, parseInt(args[maxIdx + 1], 10) || 0)
                : Number.POSITIVE_INFINITY,
        sourceFilter: srcIdx >= 0 && args[srcIdx + 1] ? args[srcIdx + 1] : null,
    };
}

function loadExistingReport(): ReportFile {
    try {
        const text = fs.readFileSync(REPORT_PATH, 'utf8');
        const parsed = JSON.parse(text) as ReportFile;
        if (!parsed.decisions || !Array.isArray(parsed.decisions)) {
            return { startedAt: new Date().toISOString(), decisions: [] };
        }
        return parsed;
    } catch {
        return { startedAt: new Date().toISOString(), decisions: [] };
    }
}

function saveReport(report: ReportFile): void {
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
}

function getDomain(url: string | null): string | null {
    if (!url) return null;
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}

async function loadJobs(sourceFilter: string | null): Promise<JobRow[]> {
    const jobs = await prisma.job.findMany({
        where: {
            isPublished: true,
            sourceType: 'external',
            applyLink: { not: '' },
            ...(sourceFilter ? { sourceProvider: sourceFilter } : {}),
        },
        select: {
            id: true,
            applyLink: true,
            title: true,
            employer: true,
            sourceProvider: true,
            externalId: true,
            qualityScore: true,
        },
    });
    return jobs as JobRow[];
}

async function runWithLimits<T>(
    items: T[],
    globalLimit: number,
    perDomainLimit: number,
    domainOf: (item: T) => string | null,
    worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
    const domainCounts = new Map<string, number>();
    let nextIndex = 0;
    let activeGlobal = 0;
    let resolveDone: (() => void) | null = null;
    const done = new Promise<void>((r) => (resolveDone = r));

    const tryStart = (): void => {
        while (nextIndex < items.length && activeGlobal < globalLimit) {
            const idx = nextIndex;
            const item = items[idx];
            const dom = domainOf(item) ?? '_';
            const inflight = domainCounts.get(dom) ?? 0;
            if (inflight >= perDomainLimit) {
                // Find a different starting point — scan ahead to grab any item
                // whose domain has headroom. If none, break and wait.
                let foundIdx = -1;
                for (let scan = nextIndex + 1; scan < items.length; scan++) {
                    const scanDom = domainOf(items[scan]) ?? '_';
                    if ((domainCounts.get(scanDom) ?? 0) < perDomainLimit) {
                        foundIdx = scan;
                        break;
                    }
                }
                if (foundIdx === -1) break;
                // Swap so we can pick it up via the simple nextIndex iteration.
                [items[nextIndex], items[foundIdx]] = [items[foundIdx], items[nextIndex]];
                continue;
            }
            nextIndex++;
            activeGlobal++;
            domainCounts.set(dom, inflight + 1);
            void worker(item, idx)
                .catch(() => undefined)
                .finally(() => {
                    activeGlobal--;
                    domainCounts.set(dom, (domainCounts.get(dom) ?? 1) - 1);
                    if (nextIndex >= items.length && activeGlobal === 0) {
                        resolveDone?.();
                    } else {
                        tryStart();
                    }
                });
        }
    };

    tryStart();
    if (items.length === 0) resolveDone?.();
    await done;
}

async function probeJob(job: JobRow): Promise<JobDecision> {
    const startedAt = Date.now();
    if (!job.applyLink) {
        return {
            jobId: job.id,
            title: job.title,
            employer: job.employer,
            source: job.sourceProvider ?? 'unknown',
            applyLink: null,
            alive: true,
            reason: 'inconclusive_other',
            finalStatus: null,
            redirectHops: 0,
            softPatternId: null,
            elapsedMs: 0,
            finalUrl: '',
            decidedAt: new Date().toISOString(),
        };
    }
    const decision = await checkJobHealth(job.applyLink, job.sourceProvider, {
        externalId: job.externalId,
    });
    return {
        jobId: job.id,
        title: job.title,
        employer: job.employer,
        source: job.sourceProvider ?? 'unknown',
        applyLink: job.applyLink,
        alive: decision.alive,
        reason: decision.reason,
        finalStatus: decision.evidence.finalStatus,
        redirectHops: decision.evidence.redirectHops,
        softPatternId: decision.evidence.softMatch?.patternId ?? null,
        elapsedMs: Date.now() - startedAt,
        finalUrl: decision.evidence.finalUrl,
        decidedAt: new Date().toISOString(),
    };
}

function summarize(decisions: ReadonlyArray<JobDecision>): {
    byReason: Record<string, number>;
    deadBySource: Record<string, number>;
    aliveBySource: Record<string, number>;
    totalDead: number;
    totalAlive: number;
} {
    const byReason: Record<string, number> = {};
    const deadBySource: Record<string, number> = {};
    const aliveBySource: Record<string, number> = {};
    for (const d of decisions) {
        byReason[d.reason] = (byReason[d.reason] ?? 0) + 1;
        if (!d.alive) {
            deadBySource[d.source] = (deadBySource[d.source] ?? 0) + 1;
        } else {
            aliveBySource[d.source] = (aliveBySource[d.source] ?? 0) + 1;
        }
    }
    const totalDead = decisions.filter((d) => !d.alive).length;
    const totalAlive = decisions.length - totalDead;
    return { byReason, deadBySource, aliveBySource, totalDead, totalAlive };
}

async function unpublishInBatches(ids: string[]): Promise<number> {
    let total = 0;
    for (let i = 0; i < ids.length; i += DB_WRITE_BATCH_SIZE) {
        const slice = ids.slice(i, i + DB_WRITE_BATCH_SIZE);
        const r = await prisma.job.updateMany({
            where: { id: { in: slice }, isManuallyUnpublished: false },
            data: { isPublished: false },
        });
        total += r.count;
        console.log(`  unpublished ${total}/${ids.length}`);
    }
    return total;
}

async function main(): Promise<void> {
    const args = parseArgs();
    const startedAt = Date.now();

    console.log('\n=== AUDIT + PRUNE DEAD JOBS ===');
    console.log(`Mode: ${args.apply ? 'APPLY (will unpublish dead jobs)' : 'DRY-RUN'}`);
    if (args.sourceFilter) console.log(`Source filter: ${args.sourceFilter}`);
    if (args.maxUnpublish !== Number.POSITIVE_INFINITY) {
        console.log(`Max unpublish per run: ${args.maxUnpublish}`);
    }

    // 1. Load existing decisions (resume support).
    const report = loadExistingReport();
    const alreadyDecided = new Set(report.decisions.map((d) => d.jobId));
    console.log(`\nExisting decisions in report: ${alreadyDecided.size}`);

    // 2. Pull jobs from the DB.
    console.log('Loading published external jobs from DB...');
    const allJobs = await loadJobs(args.sourceFilter);
    console.log(`  ${allJobs.length} candidates`);

    // 3. Filter out already-decided.
    const todoJobs = allJobs.filter((j) => !alreadyDecided.has(j.id));
    console.log(`  ${todoJobs.length} need probing (${allJobs.length - todoJobs.length} cached from prior run)`);

    // 4. Probe.
    let probed = 0;
    if (todoJobs.length > 0) {
        console.log('\nProbing...');
        await runWithLimits(
            todoJobs,
            PROBE_GLOBAL_CONCURRENCY,
            PROBE_PER_DOMAIN_CONCURRENCY,
            (job: JobRow) => getDomain(job.applyLink),
            async (job) => {
                const decision = await probeJob(job);
                report.decisions.push(decision);
                probed++;
                if (probed % PROGRESS_LOG_EVERY === 0) {
                    saveReport(report);
                    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
                    const rate = (probed / parseFloat(elapsed)).toFixed(1);
                    console.log(`  ${probed}/${todoJobs.length} (${rate}/s) — checkpoint saved`);
                }
            },
        );
        saveReport(report);
        console.log(`Probing complete. Total decisions in report: ${report.decisions.length}`);
    }

    // 5. Summarise.
    const summary = summarize(report.decisions);
    console.log('\n=== SUMMARY ===');
    console.log(`Total decisions: ${report.decisions.length}`);
    console.log(`Alive: ${summary.totalAlive}`);
    console.log(`Dead:  ${summary.totalDead} (${((summary.totalDead / report.decisions.length) * 100).toFixed(1)}%)`);
    console.log('\nBy reason:');
    for (const [reason, n] of Object.entries(summary.byReason).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${reason.padEnd(28)} ${n}`);
    }
    console.log('\nDead by source:');
    for (const [src, n] of Object.entries(summary.deadBySource).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${src.padEnd(20)} ${n}`);
    }

    // 6. Apply if requested.
    const deadIdsByReason: string[] = report.decisions
        .filter((d) => !d.alive && DEAD_REASONS.has(d.reason))
        .map((d) => d.jobId);
    const capped = deadIdsByReason.slice(0, args.maxUnpublish);

    console.log(`\nDead jobs eligible to unpublish: ${deadIdsByReason.length}`);
    if (capped.length < deadIdsByReason.length) {
        console.log(`  capped to ${capped.length} this run (--max-unpublish)`);
    }

    if (!args.apply) {
        console.log('\nDry-run complete. Pass --apply to actually unpublish.\n');
        console.log('After --apply, the existing /api/cron/deindex-expired cron will\n');
        console.log('ping Google Indexing API + IndexNow with URL_DELETED for the\n');
        console.log('newly-unpublished jobs at ~100/day quota — full deindex over ~30d.\n');
        return;
    }

    if (capped.length === 0) {
        console.log('\nNo dead jobs to unpublish. Done.\n');
        return;
    }

    console.log(`\nUnpublishing ${capped.length} dead jobs...`);
    const updated = await unpublishInBatches(capped);
    console.log(`Done. Marked ${updated} jobs is_published=false.`);
    console.log('\nNext: the deindex-expired cron at 12:45 / 18:45 UTC will start\n');
    console.log('pinging Google + IndexNow with URL_DELETED. Catalog cleanup over ~30 days.\n');
}

main()
    .then(async () => {
        await prisma.$disconnect();
        process.exit(0);
    })
    .catch(async (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('FATAL:', msg);
        await prisma.$disconnect();
        process.exit(1);
    });
