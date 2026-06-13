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
        // Gap G6 (2026-05-06): surface partial-fetch guard fires to Discord
        // so source outages don't silently disable orphan detection. Throttled
        // in-memory to one alert per source per 6h.
        await maybeAlertPartialFetch(input.source, {
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
 * Throttled Discord alert for partial-fetch guard fires (Gap G6).
 * One alert per source per 6h. Vercel functions are stateless so this
 * coalesces only within a single function instance — repeated cold starts
 * may send a few extra alerts, which is acceptable for an outage signal.
 */
const partialFetchAlertSeen = new Map<string, number>();
const PARTIAL_FETCH_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

async function maybeAlertPartialFetch(
    source: string,
    args: { fetched: number; required: number; avg: number },
): Promise<void> {
    const last = partialFetchAlertSeen.get(source) ?? 0;
    if (Date.now() - last < PARTIAL_FETCH_ALERT_COOLDOWN_MS) return;
    partialFetchAlertSeen.set(source, Date.now());

    try {
        const { sendDiscordMessage } = await import('@/lib/discord-notifier');
        await sendDiscordMessage('', [{
            title: `⚠️ ${source} partial fetch — orphan check skipped`,
            description: `${args.fetched} fetched · need ≥${args.required} (7d avg ${args.avg.toFixed(0)}/run)`,
            color: 0xFFAA00,
        }]);
    } catch {
        // Discord failures are never fatal here.
    }
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
 * Per-source-per-day cron run count. `recordIngestionStats` upserts one
 * row per source per day with `jobsFetched: { increment: fetched }`, so
 * the value in `source_stats` is the SUM across all cron runs that day.
 *
 * The partial-fetch guard compares against a SINGLE-RUN fetch count, so
 * we must divide the daily baseline by this number to compare apples to
 * apples. Otherwise per-run fetches always look ~half the baseline and
 * the guard incorrectly aborts.
 *
 * Reflects the cron schedule in vercel.json. Update this map when a cron
 * frequency changes.
 *
 * For chunked sources (greenhouse, workday) the chunked-presence
 * aggregator passes `fetchedCount = sum of all chunks in one cycle`, so
 * the same divide-by-cycles math holds.
 */
// Runs (ingest CYCLES) per day per source — MUST match vercel.json crons. For
// chunked sources (greenhouse, workday) this is cycles/day, NOT the number of
// per-chunk cron entries (chunked-presence sums all chunks into one cycle).
// Derived directly from vercel.json: a drifted value miscalibrates the presence
// guard (too-low baseline → false skipped_partial_fetch; too-high → missed
// orphan detection). Verified 2026-06-11 against the live cron schedule.
const RUNS_PER_DAY: Readonly<Record<string, number>> = {
    adzuna: 3,
    jooble: 3,            // not currently scheduled in vercel.json
    lever: 3,
    usajobs: 1,          // was 3 — vercel.json schedules usajobs once/day
    ashby: 2,            // was 3 — runs at 11:40 and 00:40
    workday: 3,          // 5 chunks × 3 cycles, but presence math uses cycles
    greenhouse: 3,       // 4 chunks × 3 cycles, presence math uses cycles
    'fantastic-jobs-db': 2,
    smartrecruiters: 3,
    icims: 3,            // not currently scheduled in vercel.json
    jazzhr: 2,           // was 3 — runs at 11:55 and 00:48
    bamboohr: 2,         // was missing (defaulted to 1) — runs 2×/day
    workable: 2,         // was missing — runs 2×/day
    doccafe: 2,          // was missing — runs 2×/day
    healthcareercenter: 2, // was missing — runs 2×/day
    'ats-jobs-db': 3,    // not currently scheduled in vercel.json
};

/**
 * Read the rolling per-RUN fetch baseline for a source. Used by the
 * partial-fetch guard inside recordSourcePresence.
 *
 * Implementation: takes the average of `source_stats.jobs_fetched` over
 * `windowDays` days (which is a per-day total) and divides by the
 * source's expected runs-per-day.
 *
 * Returns 0 when the source has no `source_stats` rows yet (caller
 * should skip the presence check in that case).
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
    const dailyAvg = typeof value === 'bigint' ? Number(value) : Number(value);
    const runsPerDay = RUNS_PER_DAY[source] ?? 1;
    return dailyAvg / runsPerDay;
}

/** Exposed for tests + admin scripts. */
export { RUNS_PER_DAY };

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
