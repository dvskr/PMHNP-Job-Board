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

/**
 * App id — MUST stay unique across every product that shares this Inngest
 * account. The id IS the app identity: whichever deployment registers with a
 * given id last wins, and Inngest silently rewrites that app's serve URL to
 * point at it. When a sibling product inherited this id (via a copy of this
 * file), it repointed the `pmhnp-job-board` app at its own domain, so every
 * event this app sent was routed to that deployment instead. Nothing errored;
 * recommendations, the digest, and instant fan-out just stopped running.
 * Never copy this id into another codebase, and never adopt one from another.
 * Locked by tests/regressions/inngest-app-id.test.ts.
 */
export const INNGEST_APP_ID = 'pmhnp-job-board';

export const inngest = new Inngest({
    id: INNGEST_APP_ID,
});
