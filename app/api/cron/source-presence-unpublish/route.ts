/**
 * Source-presence-driven auto-unpublish cron.
 *
 * Reads jobs with `health_consecutive_missing >= MISSES_THRESHOLD` and flips
 * `is_published=false`. This is the "Sprint 4" companion to the shadow-mode
 * recorder added in Sprint 2 — once Sprint 2 has been collecting telemetry
 * for a week and the threshold is confirmed, set the env flag below and
 * this cron starts removing orphaned listings (the Jooble blind-spot fix).
 *
 * Until the env flag is set, this cron runs in REPORT-ONLY mode — it logs
 * what it WOULD unpublish without flipping anything. That gives you the
 * observation period to validate the threshold against real data.
 *
 * Env flags:
 *   JOB_HEALTH_PRESENCE_AUTO_UNPUBLISH=true  — actually flip is_published
 *   JOB_HEALTH_MIN_PRESENCE_MISSES=3         — override threshold (default 3)
 *
 * Safety guards:
 *   - Never touches employer/direct posts (only `source_type = 'external'`).
 *   - Never overrides admin manual unpublishes.
 *   - Caps unpublishes per run via DEFAULT_MAX_UNPUBLISH_PER_RUN.
 *   - Records every flip into job_health_checks for audit.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { HealthRecorder } from '@/lib/health';

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
    mode: 'report_only' | 'live';
    threshold: number;
    candidates: number;
    flipped: number;
    bySource: Record<string, number>;
    cappedAt: number;
    audit: { staged: number; flushed: number; failedFlushes: number };
    elapsedSeconds: string;
}

export async function GET(req: Request): Promise<NextResponse> {
    const log = logger.withContext({ cron: 'source-presence-unpublish' });

    const authError = checkAuth(req);
    if (authError) return authError;

    const startTime = Date.now();

    try {
        const threshold = readThreshold(log);
        const live = process.env.JOB_HEALTH_PRESENCE_AUTO_UNPUBLISH === 'true';
        const mode: RunSummary['mode'] = live ? 'live' : 'report_only';
        log.info('Starting presence-unpublish sweep', { mode, threshold });

        const summary = await runSweep(threshold, live, startTime, log);
        log.info('Presence-unpublish sweep complete', { ...summary });

        return NextResponse.json({ success: true, ...summary });
    } catch (error: unknown) {
        log.error('Fatal error in presence-unpublish sweep', error);
        return NextResponse.json({ error: 'Presence unpublish failed' }, { status: 500 });
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
    live: boolean,
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
    let flipped = 0;

    if (candidates.length === 0) {
        return finalize({
            mode: live ? 'live' : 'report_only',
            threshold,
            candidates: 0,
            flipped: 0,
            bySource,
            cappedAt: DEFAULT_MAX_UNPUBLISH_PER_RUN,
            recorder,
            startTime,
        });
    }

    if (!live) {
        // Report-only mode — log volumes but do not flip.
        log.info('REPORT-ONLY: would unpublish candidates', {
            count: candidates.length,
            bySource,
        });
        return finalize({
            mode: 'report_only',
            threshold,
            candidates: candidates.length,
            flipped: 0,
            bySource,
            cappedAt: DEFAULT_MAX_UNPUBLISH_PER_RUN,
            recorder,
            startTime,
        });
    }

    // Live mode — flip in batches and audit each.
    const ids = candidates.map((c) => c.id);
    await prisma.job.updateMany({
        where: { id: { in: ids } },
        data: { isPublished: false },
    });
    flipped = candidates.length;

    for (const c of candidates) {
        await recorder.stagePresenceUnpublish(c);
    }
    await recorder.flush();

    return finalize({
        mode: 'live',
        threshold,
        candidates: candidates.length,
        flipped,
        bySource,
        cappedAt: DEFAULT_MAX_UNPUBLISH_PER_RUN,
        recorder,
        startTime,
    });
}

function finalize(args: {
    mode: 'live' | 'report_only';
    threshold: number;
    candidates: number;
    flipped: number;
    bySource: Record<string, number>;
    cappedAt: number;
    recorder: HealthRecorder;
    startTime: number;
}): RunSummary {
    return {
        mode: args.mode,
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
