import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkJobHealth, HealthRecorder, castFlipVote, type HealthDecision } from '@/lib/health';
import { logger } from '@/lib/logger';
import { inngest } from '@/lib/inngest/client';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';

export const maxDuration = 300; // 5 minutes — checks up to 1500 links with 250s time budget

const BATCH_SIZE = 15;
const MAX_JOBS_PER_RUN = 1500;
const TIME_BUDGET_MS = 250_000;
const BATCH_DELAY_MS = 200;
const UNPUBLISH_FLUSH_THRESHOLD = 50;
const CHECKED_FLUSH_THRESHOLD = 100;

interface JobToCheck {
    id: string;
    applyLink: string | null;
    title: string;
    sourceProvider: string | null;
    externalId: string | null;
}

interface RunSummary {
    checked: number;
    aliveTotal: number;
    deadTotal: number;
    inconclusive: number;
    /**
     * Dead decisions that were held back from flipping is_published because
     * voting did not yet have enough confirming signals (low-confidence
     * single soft_404 signals). Will be reconsidered on the next probe run.
     */
    deferred: number;
    errors: number;
    deadBySource: Record<string, number>;
    deadByReason: Record<string, number>;
    voteOutcomes: Record<string, number>;
    audit: { staged: number; flushed: number; failedFlushes: number };
    elapsedSeconds: string;
}

export async function GET(req: Request): Promise<NextResponse> {
    const log = logger.withContext({ cron: 'check-dead-links' });

    const authError = await verifyCronOrAdmin(req);
    if (authError) return authError;

    const startTime = Date.now();

    try {
        return await withCronTracking('check-dead-links', async () => {
            log.info('Starting dead-link sweep');

            const jobs = await loadJobsToCheck();
            log.info(`Loaded ${jobs.length} jobs for health check`);

            const summary = await runSweep(jobs, startTime, log);

            log.info('Sweep complete', { ...summary });
            return {
                response: NextResponse.json({ success: true, ...summary }),
                metrics: {
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
        await sendCronFailureAlert('check-dead-links', error);
        log.error('Fatal error during dead-link sweep', error);
        return NextResponse.json({ error: 'Dead link check failed' }, { status: 500 });
    }
}

async function loadJobsToCheck(): Promise<JobToCheck[]> {
    // Order by lastLinkCheckedAt ASC NULLS FIRST so never-checked jobs come first,
    // then least-recently-checked. Ensures fair rotation across runs.
    const jobs = await prisma.job.findMany({
        where: {
            isPublished: true,
            sourceType: 'external',
            applyLink: { not: '' },
        },
        select: {
            id: true,
            applyLink: true,
            title: true,
            sourceProvider: true,
            externalId: true,
        },
        orderBy: {
            lastLinkCheckedAt: { sort: 'asc', nulls: 'first' },
        },
        take: MAX_JOBS_PER_RUN,
    });
    return jobs as JobToCheck[];
}

async function runSweep(jobs: JobToCheck[], startTime: number, log = logger): Promise<RunSummary> {
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

        const results = await Promise.allSettled(
            batch.map((job) => checkOne(job, log)),
        );

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
            // Record every decision (alive + dead + inconclusive). Failures are
            // captured in recorder stats, never thrown.
            await recorder.stageDecision(job.id, decision);

            if (decision.alive) {
                if (decision.reason === 'alive_2xx' || decision.reason === 'alive_greenhouse_api') {
                    aliveTotal++;
                } else {
                    inconclusive++;
                }
                continue;
            }

            // Dead decision — let the multi-signal voter decide whether to flip
            // now or defer to the next probe run. Voting reads recent
            // job_health_checks rows; for a brand-new dead-classified job the
            // current decision is the only signal in the window.
            const vote = await castFlipVote(prisma, job.id, decision);
            voteOutcomes[vote.outcome] = (voteOutcomes[vote.outcome] ?? 0) + 1;

            if (!vote.flip) {
                deferred++;
                log.info('Vote deferred dead-flip — awaiting confirmation', {
                    jobId: job.id,
                    reason: decision.reason,
                    voteOutcome: vote.outcome,
                });
                continue;
            }

            deadTotal++;
            pendingDead.push(job.id);
            const src = job.sourceProvider ?? 'unknown';
            deadBySource[src] = (deadBySource[src] ?? 0) + 1;
            deadByReason[decision.reason] = (deadByReason[decision.reason] ?? 0) + 1;

            // Fire the FP-recovery scheduling event. No-op locally if
            // INNGEST_EVENT_KEY is not set; safe in all environments.
            try {
                await inngest.send({
                    name: 'job.health.flipped',
                    data: {
                        jobId: job.id,
                        sourceProvider: job.sourceProvider,
                        externalId: job.externalId,
                        applyLink: job.applyLink,
                        flippedAt: new Date().toISOString(),
                        triggeringReason: decision.reason,
                    },
                });
            } catch (sendErr: unknown) {
                // Inngest send failures are non-fatal — the unpublish still
                // proceeds; we just lose the FP-recovery scheduling for
                // this job.
                log.warn('Failed to enqueue FP-recovery event (non-fatal)', {
                    jobId: job.id,
                    err: sendErr instanceof Error ? sendErr.message : String(sendErr),
                });
            }
        }

        if (pendingDead.length >= UNPUBLISH_FLUSH_THRESHOLD) {
            await flushUnpublish(pendingDead);
            pendingDead = [];
        }
        if (pendingChecked.length >= CHECKED_FLUSH_THRESHOLD) {
            await flushCheckedTimestamp(pendingChecked);
            pendingChecked = [];
        }

        if (i + BATCH_SIZE < jobs.length) {
            await delay(BATCH_DELAY_MS);
        }
    }

    if (pendingDead.length > 0) await flushUnpublish(pendingDead);
    if (pendingChecked.length > 0) await flushCheckedTimestamp(pendingChecked);
    await recorder.flush();

    return {
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

async function checkOne(job: JobToCheck, log = logger): Promise<HealthDecision> {
    if (!job.applyLink) {
        // Treat as inconclusive_other so we don't unpublish purely on missing data.
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
    const decision = await checkJobHealth(job.applyLink, job.sourceProvider, {
        externalId: job.externalId,
    });
    if (!decision.alive) {
        log.info('Job marked dead', {
            jobId: job.id,
            source: job.sourceProvider ?? 'unknown',
            reason: decision.reason,
            finalStatus: decision.evidence.finalStatus,
            redirectHops: decision.evidence.redirectHops,
            softPattern: decision.evidence.softMatch?.patternId,
        });
    }
    return decision;
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
