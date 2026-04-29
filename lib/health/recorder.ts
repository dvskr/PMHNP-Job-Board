/**
 * Append-only recorder for job-health decisions.
 *
 * Every HTTP-probe, Greenhouse-API, and source-presence outcome lands in
 * the `job_health_checks` table via this module. Writes are batched to
 * keep the dead-link cron's throughput unchanged: callers stage records
 * with `stage()` and flush either explicitly via `flush()` or implicitly
 * once the buffer reaches `BATCH_SIZE`.
 *
 * Recorder failures are non-fatal — a logging outage must never block the
 * cron from unpublishing. Callers should `await flush()` in a `try/catch`
 * and continue on error.
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import type { HealthDecision } from './check-job-health';
import type { PresenceCheckResult } from './source-presence';

const BATCH_SIZE = 100;

export type CheckType = 'http_probe' | 'greenhouse_api' | 'source_presence';

export interface JobHealthCheckRow {
    jobId: string;
    checkType: CheckType;
    outcome: string;
    alive: boolean;
    httpStatus?: number | null;
    redirectHops?: number | null;
    finalUrl?: string | null;
    apiUrl?: string | null;
    softPatternId?: string | null;
    softMatchText?: string | null;
    errorKind?: string | null;
    errorMessage?: string | null;
    elapsedMs?: number | null;
    presenceSource?: string | null;
    presenceFetched?: number | null;
    presenceHistoricalAvg?: number | null;
    presenceSeenAgain?: number | null;
    presenceMissing?: number | null;
    presenceSkippedReason?: string | null;
    checkerVersion: string;
}

export interface RecorderStats {
    staged: number;
    flushed: number;
    failedFlushes: number;
}

/**
 * Stateful batched recorder. Re-create per cron run; do not share across
 * concurrent invocations because the buffer is unsynchronised.
 */
export class HealthRecorder {
    private buffer: JobHealthCheckRow[] = [];
    private staged = 0;
    private flushed = 0;
    private failedFlushes = 0;

    constructor(
        private readonly prisma: PrismaClient,
        private readonly batchSize: number = BATCH_SIZE,
        private readonly logErr: (msg: string, err: unknown) => void = defaultLog,
    ) {}

    /**
     * Build a row from a per-job HealthDecision and stage it. Auto-flushes
     * when the buffer reaches batchSize. Errors during auto-flush are
     * captured in stats and never thrown.
     */
    async stageDecision(jobId: string, decision: HealthDecision): Promise<void> {
        this.buffer.push(rowFromDecision(jobId, decision));
        this.staged++;
        if (this.buffer.length >= this.batchSize) {
            await this.flush();
        }
    }

    /**
     * Stage a presence-check outcome. Presence is per-source, not per-job;
     * the row references the source via presence_source. We use a
     * sentinel job_id of NULL? No — schema requires job_id. Caller passes
     * a representative job_id (typically the first published job from
     * that source); the row's presence_* columns carry the full context.
     *
     * If the presence run touched no jobs (skipped path), the caller may
     * pass null for `representativeJobId` and we drop the record (we
     * still log the skip via the structured logger elsewhere).
     */
    async stagePresence(
        representativeJobId: string | null,
        result: PresenceCheckResult,
    ): Promise<void> {
        if (!representativeJobId) return;
        this.buffer.push(rowFromPresence(representativeJobId, result));
        this.staged++;
        if (this.buffer.length >= this.batchSize) {
            await this.flush();
        }
    }

    /**
     * Drain the buffer to the database. Called automatically on size
     * threshold and explicitly by the cron at end-of-run.
     */
    async flush(): Promise<void> {
        if (this.buffer.length === 0) return;
        const batch = this.buffer;
        this.buffer = [];
        try {
            await this.prisma.jobHealthCheck.createMany({
                data: batch.map(toCreateInput),
            });
            this.flushed += batch.length;
        } catch (err: unknown) {
            this.failedFlushes++;
            this.logErr('JobHealthCheck flush failed', err);
        }
    }

    stats(): RecorderStats {
        return {
            staged: this.staged,
            flushed: this.flushed,
            failedFlushes: this.failedFlushes,
        };
    }
}

function defaultLog(msg: string, err: unknown): void {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[recorder] ${msg}: ${detail}`);
}

/** Build a row from a HealthDecision. Exported for tests. */
export function rowFromDecision(jobId: string, decision: HealthDecision): JobHealthCheckRow {
    const ev = decision.evidence;
    const checkType: CheckType = ev.sourceProbe?.kind === 'greenhouse_api'
        ? 'greenhouse_api'
        : 'http_probe';
    return {
        jobId,
        checkType,
        outcome: decision.reason,
        alive: decision.alive,
        httpStatus: ev.finalStatus,
        redirectHops: ev.redirectHops,
        finalUrl: nullIfEmpty(ev.finalUrl),
        apiUrl: ev.sourceProbe?.apiUrl ?? null,
        softPatternId: ev.softMatch?.patternId ?? null,
        softMatchText: ev.softMatch?.matchText ?? null,
        errorKind: ev.errorKind,
        errorMessage: ev.errorMessage,
        elapsedMs: ev.elapsedMs,
        checkerVersion: ev.checkerVersion,
    };
}

/** Build a row from a PresenceCheckResult. Exported for tests. */
export function rowFromPresence(jobId: string, result: PresenceCheckResult): JobHealthCheckRow {
    return {
        jobId,
        checkType: 'source_presence',
        outcome: result.outcome,
        // Presence runs that flip is_published live in Sprint 4. For now
        // every presence row is "alive=true" because shadow-mode never kills.
        alive: true,
        presenceSource: result.source,
        presenceFetched: result.fetched,
        presenceHistoricalAvg: result.historicalAvgFetched,
        presenceSeenAgain: result.seenAgain,
        presenceMissing: result.missingThisRun,
        presenceSkippedReason: result.skippedReason,
        elapsedMs: result.elapsedMs,
        checkerVersion: result.checkerVersion,
    };
}

function nullIfEmpty(s: string | null | undefined): string | null {
    if (s === null || s === undefined) return null;
    if (s.trim().length === 0) return null;
    return s;
}

function toCreateInput(row: JobHealthCheckRow): Prisma.JobHealthCheckCreateManyInput {
    return {
        jobId: row.jobId,
        checkType: row.checkType,
        outcome: row.outcome,
        alive: row.alive,
        httpStatus: row.httpStatus ?? null,
        redirectHops: row.redirectHops ?? null,
        finalUrl: row.finalUrl ?? null,
        apiUrl: row.apiUrl ?? null,
        softPatternId: row.softPatternId ?? null,
        softMatchText: row.softMatchText ?? null,
        errorKind: row.errorKind ?? null,
        errorMessage: row.errorMessage ?? null,
        elapsedMs: row.elapsedMs ?? null,
        presenceSource: row.presenceSource ?? null,
        presenceFetched: row.presenceFetched ?? null,
        presenceHistoricalAvg: row.presenceHistoricalAvg ?? null,
        presenceSeenAgain: row.presenceSeenAgain ?? null,
        presenceMissing: row.presenceMissing ?? null,
        presenceSkippedReason: row.presenceSkippedReason ?? null,
        checkerVersion: row.checkerVersion,
    };
}
