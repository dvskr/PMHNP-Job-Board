/**
 * Inngest client for the job-health workflow runtime.
 *
 * Inngest provides durable, replayable function execution with built-in
 * retry, scheduling, and concurrency controls — the right primitive for
 * the FP-recovery loop (re-probe at 6h/24h/72h after a dead-flip) that
 * Vercel cron alone can't model cleanly.
 *
 * Activation: set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY in env. Until
 * those are set, Inngest functions still register on app boot but events
 * fired via `inngest.send(...)` no-op locally and silently drop in prod.
 */

import { Inngest } from 'inngest';

export interface JobHealthFlippedEventData {
    jobId: string;
    sourceProvider: string | null;
    externalId: string | null;
    applyLink: string | null;
    flippedAt: string;
    /** The HealthReason that triggered the original flip. */
    triggeringReason: string;
}

export interface FpRecoveryProbeEventData {
    jobId: string;
    sourceProvider: string | null;
    externalId: string | null;
    applyLink: string | null;
    attempt: 1 | 2 | 3;
    /** ISO timestamp from the original flip. */
    originallyFlippedAt: string;
}

export const inngest = new Inngest({
    id: 'pmhnp-job-board',
});
