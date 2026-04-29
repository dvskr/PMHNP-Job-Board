import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkJobHealth, type HealthDecision } from '@/lib/health';
import { logger } from '@/lib/logger';

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
    errors: number;
    deadBySource: Record<string, number>;
    deadByReason: Record<string, number>;
    elapsedSeconds: string;
}

export async function GET(req: Request): Promise<NextResponse> {
    const log = logger.withContext({ cron: 'check-dead-links' });

    const authError = checkAuth(req);
    if (authError) return authError;

    const startTime = Date.now();

    try {
        log.info('Starting dead-link sweep');

        const jobs = await loadJobsToCheck();
        log.info(`Loaded ${jobs.length} jobs for health check`);

        const summary = await runSweep(jobs, startTime, log);

        log.info('Sweep complete', { ...summary });
        return NextResponse.json({ success: true, ...summary });
    } catch (error: unknown) {
        log.error('Fatal error during dead-link sweep', error);
        return NextResponse.json({ error: 'Dead link check failed' }, { status: 500 });
    }
}

function checkAuth(req: Request): NextResponse | null {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        if (process.env.NODE_ENV !== 'development') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }
    return null;
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
    let errors = 0;
    const deadBySource: Record<string, number> = {};
    const deadByReason: Record<string, number> = {};
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

            if (!decision.alive) {
                deadTotal++;
                pendingDead.push(job.id);
                const src = job.sourceProvider ?? 'unknown';
                deadBySource[src] = (deadBySource[src] ?? 0) + 1;
                deadByReason[decision.reason] = (deadByReason[decision.reason] ?? 0) + 1;
            } else if (decision.reason === 'alive_2xx') {
                aliveTotal++;
            } else {
                inconclusive++;
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

    return {
        checked,
        aliveTotal,
        deadTotal,
        inconclusive,
        errors,
        deadBySource,
        deadByReason,
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
