/**
 * Source-presence tracking.
 *
 * After every successful ingest run, this module compares the set of
 * external_ids returned by the source against the set of currently-published
 * jobs from that source. The result is written to two columns on `jobs`:
 *
 *   - `health_consecutive_missing` — incremented on each consecutive miss,
 *     reset to 0 on re-appearance.
 *   - `health_last_seen_at` — bumped to NOW() when the external_id was
 *     present in the latest fetch.
 *
 * Sprint 2 deploys this in shadow mode — columns are written, but
 * `is_published` is never flipped here. Sprint 3 will introduce a separate
 * cron that unpublishes jobs whose `health_consecutive_missing >= N` once
 * production telemetry has tuned the threshold and the "full fetch" guard.
 *
 * False-positive guard: source outages (partial responses) must not strike
 * jobs as missing. The caller is required to pass a `fetchedCount` plus a
 * `historicalAvgFetched` floor; we abort the presence check when the run
 * looks too small relative to baseline.
 */

import type { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';
import type { HealthRecorder } from './recorder';

export const PRESENCE_CHECKER_VERSION = 'v1.0.0';

/** Default minimum ratio of fetched/historicalAvg required to trust the run. */
export const DEFAULT_MIN_FETCH_RATIO = 0.5;

/** Cap how many missing-job updates we will issue per run, for safety. */
export const DEFAULT_MAX_UPDATES_PER_RUN = 5_000;

export interface PresenceCheckInput {
    /** The aggregator source name (matches `jobs.source_provider`). */
    source: string;
    /** External IDs returned by the latest successful fetch. */
    fetchedExternalIds: ReadonlyArray<string>;
    /**
     * Total raw fetch count this run, before any per-job filtering. Used
     * with `historicalAvgFetched` to detect partial outages.
     */
    fetchedCount: number;
    /** 7-day rolling average of fetched count for this source. */
    historicalAvgFetched: number;
    /** Override the partial-fetch guard ratio. */
    minFetchRatio?: number;
    /** Cap update fan-out for safety. */
    maxUpdates?: number;
    /**
     * Optional audit recorder. When supplied, a single summary row is
     * staged per run, anchored to a representative job_id from this
     * source (chosen deterministically for traceability). Skip-path runs
     * are recorded too — anchored to any published job from this source
     * if one exists, otherwise dropped.
     */
    recorder?: HealthRecorder;
}

export type PresenceCheckOutcome =
    | 'completed'
    | 'skipped_partial_fetch'
    | 'skipped_zero_fetched'
    | 'skipped_no_baseline';

export interface PresenceCheckResult {
    outcome: PresenceCheckOutcome;
    source: string;
    fetched: number;
    historicalAvgFetched: number;
    publishedFromSource: number;
    seenAgain: number;
    missingThisRun: number;
    updatesIssued: number;
    skippedReason: string | null;
    elapsedMs: number;
    checkerVersion: string;
}

/**
 * Run a presence check for one source.
 *
 * Behavior:
 *   1. Validate `fetchedCount >= max(1, historicalAvgFetched * minFetchRatio)`.
 *      Otherwise → outcome=skipped_partial_fetch (likely source outage).
 *   2. Load all published jobs for this source.
 *   3. For jobs whose `external_id` is in `fetchedExternalIds`:
 *      reset `health_consecutive_missing=0`, bump `health_last_seen_at=NOW()`.
 *   4. For jobs whose `external_id` is NOT in `fetchedExternalIds`:
 *      `health_consecutive_missing += 1`.
 *   5. Sprint 2 stops here — no `is_published` flip.
 */
export async function recordSourcePresence(
    prisma: PrismaClient,
    input: PresenceCheckInput,
): Promise<PresenceCheckResult> {
    const start = Date.now();
    const log = logger.withContext({ component: 'source-presence', source: input.source });
    const minFetchRatio = input.minFetchRatio ?? DEFAULT_MIN_FETCH_RATIO;
    const maxUpdates = input.maxUpdates ?? DEFAULT_MAX_UPDATES_PER_RUN;

    const baseResult: Omit<PresenceCheckResult, 'outcome' | 'skippedReason'> = {
        source: input.source,
        fetched: input.fetchedCount,
        historicalAvgFetched: input.historicalAvgFetched,
        publishedFromSource: 0,
        seenAgain: 0,
        missingThisRun: 0,
        updatesIssued: 0,
        elapsedMs: 0,
        checkerVersion: PRESENCE_CHECKER_VERSION,
    };

    const finalize = (
        outcome: PresenceCheckOutcome,
        skippedReason: string | null,
        partial: Partial<PresenceCheckResult> = {},
    ): PresenceCheckResult => ({
        ...baseResult,
        ...partial,
        outcome,
        skippedReason,
        elapsedMs: Date.now() - start,
    });

    const recordSkip = async (
        outcome: PresenceCheckOutcome,
        skippedReason: string,
    ): Promise<PresenceCheckResult> => {
        const result = finalize(outcome, skippedReason);
        if (input.recorder) {
            const anchor = await findRepresentativeJobId(prisma, input.source);
            await input.recorder.stagePresence(anchor, result);
        }
        return result;
    };

    if (input.fetchedCount === 0) {
        log.warn('Skipping presence check — source returned 0 jobs');
        return recordSkip('skipped_zero_fetched', 'fetchedCount=0');
    }

    if (input.historicalAvgFetched <= 0) {
        log.info('Skipping presence check — no baseline yet for this source');
        return recordSkip('skipped_no_baseline', 'historicalAvgFetched<=0');
    }

    const minRequired = Math.max(1, Math.floor(input.historicalAvgFetched * minFetchRatio));
    if (input.fetchedCount < minRequired) {
        log.warn('Skipping presence check — partial fetch suspected', {
            fetched: input.fetchedCount,
            required: minRequired,
            avg: input.historicalAvgFetched,
        });
        return recordSkip('skipped_partial_fetch', `fetched=${input.fetchedCount} < required=${minRequired}`);
    }

    const fetchedSet = new Set(input.fetchedExternalIds);

    const published = await prisma.job.findMany({
        where: {
            sourceProvider: input.source,
            isPublished: true,
            externalId: { not: null },
        },
        select: { id: true, externalId: true },
    });

    const seenAgainIds: string[] = [];
    const missingIds: string[] = [];
    for (const job of published) {
        if (job.externalId && fetchedSet.has(job.externalId)) {
            seenAgainIds.push(job.id);
        } else {
            missingIds.push(job.id);
        }
    }

    let updates = 0;

    if (seenAgainIds.length > 0) {
        const slice = seenAgainIds.slice(0, maxUpdates);
        await prisma.job.updateMany({
            where: { id: { in: slice } },
            data: {
                healthConsecutiveMissing: 0,
                healthLastSeenAt: new Date(),
            },
        });
        updates += slice.length;
    }

    if (missingIds.length > 0 && updates < maxUpdates) {
        const remaining = maxUpdates - updates;
        const slice = missingIds.slice(0, remaining);
        await prisma.job.updateMany({
            where: { id: { in: slice } },
            data: { healthConsecutiveMissing: { increment: 1 } },
        });
        updates += slice.length;
    }

    const result = finalize('completed', null, {
        publishedFromSource: published.length,
        seenAgain: seenAgainIds.length,
        missingThisRun: missingIds.length,
        updatesIssued: updates,
    });

    log.info('Presence check complete', {
        publishedFromSource: result.publishedFromSource,
        seenAgain: result.seenAgain,
        missing: result.missingThisRun,
        updates: result.updatesIssued,
        elapsedMs: result.elapsedMs,
    });

    if (input.recorder) {
        // Anchor to the first published job from this source for FK
        // traceability. Audit row carries the run-level metrics in the
        // presence_* columns; per-job state lives on the jobs table.
        const anchor = published.length > 0 ? published[0].id : null;
        await input.recorder.stagePresence(anchor, result);
    }

    return result;
}

/**
 * Find any published job from a source — used to anchor presence audit rows
 * when no jobs were touched in the run (skip paths).
 */
async function findRepresentativeJobId(
    prisma: PrismaClient,
    source: string,
): Promise<string | null> {
    const job = await prisma.job.findFirst({
        where: { sourceProvider: source, isPublished: true },
        select: { id: true },
    });
    return job?.id ?? null;
}

/**
 * Read the 7-day rolling average fetch count for a source. Used as the
 * baseline for the partial-fetch guard.
 *
 * Returns 0 when the source has no `source_stats` rows yet (caller should
 * skip the presence check in that case).
 */
export async function loadHistoricalAvgFetched(
    prisma: PrismaClient,
    source: string,
    windowDays = 7,
): Promise<number> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const rows = await prisma.$queryRaw<Array<{ avg: bigint | number | null }>>`
        SELECT AVG(jobs_fetched)::float AS avg
        FROM source_stats
        WHERE source = ${source} AND date >= ${since}
    `;
    const value = rows[0]?.avg;
    if (value === null || value === undefined) return 0;
    return typeof value === 'bigint' ? Number(value) : Number(value);
}

/**
 * Pure helper for tests / dry-runs. Computes the diff between published and
 * fetched without touching the DB.
 */
export function computePresenceDiff(
    publishedExternalIds: ReadonlyArray<string>,
    fetchedExternalIds: ReadonlyArray<string>,
): { seenAgain: string[]; missing: string[] } {
    const fetchedSet = new Set(fetchedExternalIds);
    const seenAgain: string[] = [];
    const missing: string[] = [];
    for (const id of publishedExternalIds) {
        if (fetchedSet.has(id)) seenAgain.push(id);
        else missing.push(id);
    }
    return { seenAgain, missing };
}
