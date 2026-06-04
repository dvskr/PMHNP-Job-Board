import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkJobHealth, HealthRecorder, castFlipVote, type HealthDecision } from '@/lib/health';
import { logger } from '@/lib/logger';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';

/**
 * Engagement-anomaly probe cron (Gap G3, 2026-05-06).
 *
 * Closes the dead-detection blind spot where a posting page is technically
 * still serving 200 OK (so the dead-link cron leaves it alive) but no real
 * applicant can actually apply — the apply form is broken, the underlying
 * req has been reassigned to an internal-only ATS, etc. The signal we use:
 * many views + zero apply-link clicks over a meaningful time window.
 *
 * Selection criteria:
 *   - isPublished = true
 *   - viewCount  ≥ ENGAGEMENT_VIEW_THRESHOLD
 *   - applyClickCount = 0
 *   - job is at least ENGAGEMENT_AGE_MIN_DAYS old (let it attract clicks)
 *   - lastLinkCheckedAt is null or older than ENGAGEMENT_RECHECK_GAP_MS
 *     (don't waste budget re-probing a job we just checked)
 *
 * Action: run checkJobHealth → cast vote → flip is_published if vote agrees.
 * Records each decision in job_health_checks via stageEngagementAnomaly so
 * the audit trail mirrors the regular dead-link sweep.
 */

export const maxDuration = 300;

const BATCH_SIZE = 15;
const MAX_JOBS_PER_RUN = 800;
const TIME_BUDGET_MS = 250_000;
const BATCH_DELAY_MS = 200;
const ENGAGEMENT_VIEW_THRESHOLD = 50;
const ENGAGEMENT_AGE_MIN_DAYS = 14;
const ENGAGEMENT_RECHECK_GAP_MS = 24 * 60 * 60 * 1000; // 24h

interface JobToCheck {
    id: string;
    applyLink: string | null;
    title: string;
    sourceProvider: string | null;
    externalId: string | null;
    viewCount: number;
}

interface RunSummary {
    candidates: number;
    checked: number;
    aliveTotal: number;
    deadTotal: number;
    inconclusive: number;
    deferred: number;
    errors: number;
    deadBySource: Record<string, number>;
    deadByReason: Record<string, number>;
    voteOutcomes: Record<string, number>;
    audit: { staged: number; flushed: number; failedFlushes: number };
    elapsedSeconds: string;
}

export async function GET(req: Request): Promise<NextResponse> {
    const log = logger.withContext({ cron: 'engagement-anomaly' });
    const authError = await verifyCronOrAdmin(req);
    if (authError) return authError;

    const startTime = Date.now();
    try {
        return await withCronTracking('engagement-anomaly', async () => {
            log.info('Starting engagement-anomaly sweep', {
                viewThreshold: ENGAGEMENT_VIEW_THRESHOLD,
                ageMinDays: ENGAGEMENT_AGE_MIN_DAYS,
            });

            const candidates = await loadAnomalyCandidates();
            log.info(`Loaded ${candidates.length} engagement-anomaly candidates`);

            const summary = await runSweep(candidates, startTime, log);
            log.info('Engagement-anomaly sweep complete', { ...summary });
            return {
                response: NextResponse.json({ success: true, ...summary }),
                metrics: {
                    candidates: summary.candidates,
                    checked: summary.checked,
                    aliveTotal: summary.aliveTotal,
                    deadTotal: summary.deadTotal,
                    inconclusive: summary.inconclusive,
                    deferred: summary.deferred,
                    errors: summary.errors,
                },
            };
        });
    } catch (error: unknown) {
        await sendCronFailureAlert('engagement-anomaly', error);
        log.error('Fatal error during engagement-anomaly sweep', error);
        return NextResponse.json({ error: 'Engagement anomaly check failed' }, { status: 500 });
    }
}

async function loadAnomalyCandidates(): Promise<JobToCheck[]> {
    const ageCutoff = new Date(Date.now() - ENGAGEMENT_AGE_MIN_DAYS * 24 * 60 * 60 * 1000);
    const recheckCutoff = new Date(Date.now() - ENGAGEMENT_RECHECK_GAP_MS);

    const jobs = await prisma.job.findMany({
        where: {
            isPublished: true,
            sourceType: 'external',
            applyLink: { not: '' },
            viewCount: { gte: ENGAGEMENT_VIEW_THRESHOLD },
            applyClickCount: 0,
            createdAt: { lte: ageCutoff },
            OR: [
                { lastLinkCheckedAt: null },
                { lastLinkCheckedAt: { lte: recheckCutoff } },
            ],
        },
        select: {
            id: true,
            applyLink: true,
            title: true,
            sourceProvider: true,
            externalId: true,
            viewCount: true,
        },
        orderBy: { viewCount: 'desc' }, // probe loudest anomalies first
        take: MAX_JOBS_PER_RUN,
    });
    return jobs as JobToCheck[];
}

async function runSweep(
    jobs: JobToCheck[],
    startTime: number,
    log = logger,
): Promise<RunSummary> {
    let checked = 0;
    let aliveTotal = 0;
    let deadTotal = 0;
    let inconclusive = 0;
    let deferred = 0;
    let errors = 0;
    const deadBySource: Record<string, number> = {};
    const deadByReason: Record<string, number> = {};
    const voteOutcomes: Record<string, number> = {};
    const recorder = new HealthRecorder(prisma);
    let pendingDead: string[] = [];
    let pendingChecked: string[] = [];

    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
        if (Date.now() - startTime >= TIME_BUDGET_MS) {
            log.warn('Time budget exhausted', { checked, total: jobs.length });
            break;
        }

        const batch = jobs.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(batch.map((job) => checkOne(job)));

        for (let j = 0; j < results.length; j++) {
            const r = results[j];
            const job = batch[j];
            checked++;

            if (r.status !== 'fulfilled') {
                errors++;
                continue;
            }

            const decision = r.value;
            pendingChecked.push(job.id);
            await recorder.stageEngagementAnomaly(job.id, decision, job.viewCount);

            if (decision.alive) {
                if (decision.reason === 'alive_2xx' || decision.reason.startsWith('alive_')) {
                    aliveTotal++;
                } else {
                    inconclusive++;
                }
                continue;
            }

            // Dead → consult voter (same multi-signal guard as dead-link cron).
            const vote = await castFlipVote(prisma, job.id, decision);
            voteOutcomes[vote.outcome] = (voteOutcomes[vote.outcome] ?? 0) + 1;
            if (!vote.flip) {
                deferred++;
                continue;
            }

            deadTotal++;
            pendingDead.push(job.id);
            const src = job.sourceProvider ?? 'unknown';
            deadBySource[src] = (deadBySource[src] ?? 0) + 1;
            deadByReason[decision.reason] = (deadByReason[decision.reason] ?? 0) + 1;

            log.info('Engagement-anomaly job flipped to dead', {
                jobId: job.id,
                source: src,
                reason: decision.reason,
                viewCount: job.viewCount,
            });
        }

        if (pendingDead.length >= 50) {
            await flushUnpublish(pendingDead);
            pendingDead = [];
        }
        if (pendingChecked.length >= 100) {
            await flushCheckedTimestamp(pendingChecked);
            pendingChecked = [];
        }

        if (i + BATCH_SIZE < jobs.length) await delay(BATCH_DELAY_MS);
    }

    if (pendingDead.length > 0) await flushUnpublish(pendingDead);
    if (pendingChecked.length > 0) await flushCheckedTimestamp(pendingChecked);
    await recorder.flush();

    return {
        candidates: jobs.length,
        checked,
        aliveTotal,
        deadTotal,
        inconclusive,
        deferred,
        errors,
        deadBySource,
        deadByReason,
        voteOutcomes,
        audit: recorder.stats(),
        elapsedSeconds: ((Date.now() - startTime) / 1000).toFixed(1),
    };
}

async function checkOne(job: JobToCheck): Promise<HealthDecision> {
    if (!job.applyLink) {
        return {
            alive: true,
            reason: 'inconclusive_other',
            evidence: {
                finalStatus: null,
                finalUrl: '',
                redirectHops: 0,
                softMatch: null,
                elapsedMs: 0,
                errorKind: null,
                errorMessage: 'no apply link',
                checkerVersion: 'n/a',
                sourceProbe: null,
            },
        };
    }
    return checkJobHealth(job.applyLink, job.sourceProvider, { externalId: job.externalId });
}

async function flushUnpublish(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await prisma.job.updateMany({
        where: { id: { in: ids } },
        data: { isPublished: false },
    });
}

async function flushCheckedTimestamp(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await prisma.job.updateMany({
        where: { id: { in: ids } },
        data: { lastLinkCheckedAt: new Date() },
    });
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
