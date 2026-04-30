/**
 * Source-presence-driven auto-unpublish cron.
 *
 * Reads jobs with `health_consecutive_missing >= MISSES_THRESHOLD` and flips
 * `is_published=false`. Companion to the source-presence recorder added in
 * Sprint 2 — closes the Jooble blind-spot from the original audit (jobs
 * that the source has stopped returning across multiple ingest runs but
 * that we have no HTTP signal on, so the dead-link cron leaves them up).
 *
 * Env flags:
 *   JOB_HEALTH_MIN_PRESENCE_MISSES=3  — override threshold (default 3)
 *
 * Safety guards baked in:
 *   - Only `source_type = 'external'` (never employer/direct posts).
 *   - Skips jobs with `is_manually_unpublished = true` (admin sticky).
 *   - DEFAULT_MAX_UNPUBLISH_PER_RUN = 1000 cap.
 *   - The counter only increments when the partial-fetch guard in
 *     recordSourcePresence passes (fetched >= 0.5 * 7d-rolling-avg) —
 *     source outages do not falsely strike jobs as missing.
 *   - Records every flip into job_health_checks for full audit.
 *
 * To temporarily disable: pause the cron entry in vercel.json or revert
 * the most recent code change. There is no env flag for off — the cron
 * is either scheduled or it isn't.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { HealthRecorder } from '@/lib/health';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';

export const maxDuration = 120;

const DEFAULT_MIN_MISSES = 3;
const DEFAULT_MAX_UNPUBLISH_PER_RUN = 1_000;
const PRESENCE_UNPUBLISH_VERSION = 'v1.0.0';

interface JobRow {
    id: string;
    sourceProvider: string | null;
    healthConsecutiveMissing: number;
}

interface RunSummary {
    threshold: number;
    candidates: number;
    flipped: number;
    bySource: Record<string, number>;
    cappedAt: number;
    audit: { staged: number; flushed: number; failedFlushes: number; lastError: string | null };
    elapsedSeconds: string;
}

export async function GET(req: Request): Promise<NextResponse> {
    const log = logger.withContext({ cron: 'source-presence-unpublish' });

    const authError = await verifyCronOrAdmin(req);
    if (authError) return authError;

    const startTime = Date.now();

    try {
        const threshold = readThreshold(log);
        log.info('Starting presence-unpublish sweep', { threshold });

        const summary = await runSweep(threshold, startTime, log);
        log.info('Presence-unpublish sweep complete', { ...summary });

        return NextResponse.json({ success: true, ...summary });
    } catch (error: unknown) {
        await sendCronFailureAlert('source-presence-unpublish', error);
        log.error('Fatal error in presence-unpublish sweep', error);
        return NextResponse.json({ error: 'Presence unpublish failed' }, { status: 500 });
    }
}

function readThreshold(log = logger): number {
    const raw = process.env.JOB_HEALTH_MIN_PRESENCE_MISSES;
    if (!raw) return DEFAULT_MIN_MISSES;
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        log.warn('Invalid JOB_HEALTH_MIN_PRESENCE_MISSES — falling back to default', { raw });
        return DEFAULT_MIN_MISSES;
    }
    return parsed;
}

async function runSweep(
    threshold: number,
    startTime: number,
    log = logger,
): Promise<RunSummary> {
    const candidates: JobRow[] = await prisma.job.findMany({
        where: {
            isPublished: true,
            isManuallyUnpublished: false,
            sourceType: 'external',
            healthConsecutiveMissing: { gte: threshold },
        },
        select: {
            id: true,
            sourceProvider: true,
            healthConsecutiveMissing: true,
        },
        take: DEFAULT_MAX_UNPUBLISH_PER_RUN,
    });

    const bySource: Record<string, number> = {};
    for (const c of candidates) {
        const src = c.sourceProvider ?? 'unknown';
        bySource[src] = (bySource[src] ?? 0) + 1;
    }

    const recorder = new HealthRecorder(prisma);

    if (candidates.length === 0) {
        return finalize({
            threshold,
            candidates: 0,
            flipped: 0,
            bySource,
            cappedAt: DEFAULT_MAX_UNPUBLISH_PER_RUN,
            recorder,
            startTime,
        });
    }

    log.info('Unpublishing candidates', {
        count: candidates.length,
        bySource,
    });

    const ids = candidates.map((c) => c.id);
    await prisma.job.updateMany({
        where: { id: { in: ids } },
        data: { isPublished: false },
    });

    for (const c of candidates) {
        await recorder.stagePresenceUnpublish(c);
    }
    await recorder.flush();

    return finalize({
        threshold,
        candidates: candidates.length,
        flipped: candidates.length,
        bySource,
        cappedAt: DEFAULT_MAX_UNPUBLISH_PER_RUN,
        recorder,
        startTime,
    });
}

function finalize(args: {
    threshold: number;
    candidates: number;
    flipped: number;
    bySource: Record<string, number>;
    cappedAt: number;
    recorder: HealthRecorder;
    startTime: number;
}): RunSummary {
    return {
        threshold: args.threshold,
        candidates: args.candidates,
        flipped: args.flipped,
        bySource: args.bySource,
        cappedAt: args.cappedAt,
        audit: args.recorder.stats(),
        elapsedSeconds: ((Date.now() - args.startTime) / 1000).toFixed(1),
    };
}

// Suppress unused warning on the version constant — exported for tooling.
export { PRESENCE_UNPUBLISH_VERSION };
