/**
 * Standard adapter contract.
 *
 * Each source under lib/aggregators/ implements this interface as the
 * migration target. Today the orchestrator's switch in
 * lib/ingestion-service.ts:fetchFromSource still calls per-source
 * `fetch{Source}Jobs` functions — once every adapter exports an
 * `Aggregator`, the switch can be replaced with a registry lookup.
 *
 * Migrating an adapter to this interface is non-breaking: keep the
 * legacy `fetch{Source}Jobs` export for the orchestrator AND export
 * the new `Aggregator` for future use. Lever was the first migration
 * (2026-05-05).
 */

import type { HealthDecision } from '@/lib/health/check-job-health';

/**
 * Stable provider key persisted to jobs.source_provider. Single source
 * of truth — adding a new source means adding to this union AND the
 * `aggregators` registry below.
 */
export type JobSource =
    | 'adzuna'
    | 'greenhouse'
    | 'lever'
    | 'workday'
    | 'fantastic-jobs-db'
    | 'smartrecruiters';

/**
 * Canonical raw-job shape produced by adapters and consumed by the
 * normalizer. Adapters may include source-specific fields beyond these
 * — the normalizer's per-source field map picks them up.
 */
export interface RawJobData {
    externalId: string;
    title: string;
    company: string;
    location: string;
    description: string;
    applyLink: string;
    postedDate?: string;
    job_type?: string | null;
    /** Underlying ATS the source reports (e.g. greenhouse, paylocity).
     * Persisted to jobs.source_site for cross-source attribution. */
    sourceSite?: string;
    /** Permits any source-specific extras without breaking the contract. */
    [key: string]: unknown;
}

export interface FetchOptions {
    chunk?: number;
    /** fantastic-jobs-db endpoint selector. */
    endpoint?: '7d' | '6m';
}

export interface Aggregator {
    /** Stable provider key persisted to jobs.source_provider. */
    readonly key: JobSource;

    /**
     * Number of cron chunks this source needs. 1 for sources that fit
     * inside a single 240s ingest budget. >1 (e.g. greenhouse=8,
     * workday=5) for sources whose tenant fan-out exceeds it.
     *
     * vercel.json's cron schedule must match this number; today the
     * relationship is hand-maintained, with a unit test asserting
     * the two stay in sync (see tests/aggregators/chunk-count.test.ts).
     */
    readonly chunkCount: number;

    fetch(opts?: FetchOptions): Promise<RawJobData[]>;

    /**
     * Optional native health probe. Sources that expose a per-posting
     * status endpoint (greenhouse, lever, smartrecruiters) implement
     * this; HTTP-only sources skip and rely on lib/health/probe.ts.
     *
     * Today checkJobHealth has hardcoded `if (sourceKey === ...)`
     * branches per source — once every adapter implements `probeJob`,
     * checkJobHealth can dispatch through `aggregator.probeJob ?? probeUrl`.
     */
    probeJob?(externalId: string, applyLink: string): Promise<HealthDecision | null>;
}

/**
 * Shared rate-limit primitive. Each adapter currently rolls its own
 * `setTimeout(resolve, N)` sleep; new code should compose this instead
 * so we have one place to tune throttle policy per source.
 */
export class RateLimiter {
    private nextEarliestAt = 0;

    constructor(private readonly minIntervalMs: number) {}

    async throttle(): Promise<void> {
        const now = Date.now();
        const wait = this.nextEarliestAt - now;
        if (wait > 0) {
            await new Promise((resolve) => setTimeout(resolve, wait));
        }
        this.nextEarliestAt = Math.max(now, this.nextEarliestAt) + this.minIntervalMs;
    }

    /** For tests / explicit reset. */
    reset(): void {
        this.nextEarliestAt = 0;
    }
}
