/**
 * Multi-signal voting for job-health flip decisions.
 *
 * Sprints 1-3 ship a "single-signal kill" model: one dead decision is enough
 * to flip `is_published=false`. That's defensible for high-confidence signals
 * (a definitive 404 from the source's own API, a hard HTTP 404/410), but
 * leaves residual false-positive risk for `soft_404` — a regex-driven body
 * pattern that could theoretically false-fire on legitimate content.
 *
 * This module sits between the per-decision result and the unpublish step,
 * applying a vote rule defined in docs/job-health-architecture.md §4:
 *
 *   - HIGH-confidence dead reasons (greenhouse_api_404 / http_404 / http_410):
 *     1 signal is enough → flip immediately.
 *   - LOW-confidence dead reasons (soft_404 / future patterns):
 *     require ≥ 2 dead decisions in the last N rows of `job_health_checks`,
 *     OR 1 LOW + 1 HIGH already on file → flip.
 *   - Otherwise: do not flip yet (decision is staged in the audit table; the
 *     next probe run will reconsider).
 *
 * Voting is read-only — it queries `job_health_checks` and returns an
 * outcome. The caller (the dead-link cron) owns the actual `is_published`
 * mutation. The audit row for the *current* decision must already be staged
 * by the recorder before voting reads history (otherwise the current
 * decision is invisible to the vote).
 */

import type { PrismaClient } from '@prisma/client';
import type { HealthDecision, HealthReason } from './check-job-health';

export const VOTE_CHECKER_VERSION = 'v1.0.0';

/** How many recent audit rows to consider when voting. */
export const DEFAULT_VOTE_WINDOW = 3;

/** Reasons that count as a high-confidence dead signal. */
const HIGH_CONFIDENCE_DEAD: ReadonlySet<HealthReason> = new Set([
    'greenhouse_api_404',
    'http_404',
    'http_410',
]);

/** Reasons that count as a low-confidence dead signal. */
const LOW_CONFIDENCE_DEAD: ReadonlySet<HealthReason> = new Set([
    'soft_404',
]);

export type VoteOutcome =
    | 'flip_high_confidence'
    | 'flip_two_low_signals'
    | 'flip_low_plus_high'
    | 'awaiting_confirmation'
    | 'still_alive';

export interface VoteResult {
    flip: boolean;
    outcome: VoteOutcome;
    /** Number of dead-classified decisions seen in the vote window. */
    deadCount: number;
    /** Number of HIGH-confidence dead decisions seen in the vote window. */
    highConfidenceDeadCount: number;
    /** Reasons consulted, newest first. */
    consideredReasons: HealthReason[];
    voteCheckerVersion: string;
}

/**
 * Pure decision function — given the current decision and the recent
 * audit history (most-recent first), return whether to flip and why.
 *
 * Exported separately so it can be unit-tested without a database.
 */
export function tally(
    current: HealthDecision,
    recentReasons: ReadonlyArray<HealthReason>,
): VoteResult {
    const all: HealthReason[] = [current.reason, ...recentReasons];
    const deadCount = all.filter((r) => isDead(r)).length;
    const highConfidenceDeadCount = all.filter((r) => HIGH_CONFIDENCE_DEAD.has(r)).length;

    const result = (flip: boolean, outcome: VoteOutcome): VoteResult => ({
        flip,
        outcome,
        deadCount,
        highConfidenceDeadCount,
        consideredReasons: all,
        voteCheckerVersion: VOTE_CHECKER_VERSION,
    });

    // Current decision says alive → never flip on this pass.
    if (current.alive) {
        return result(false, 'still_alive');
    }

    // High-confidence dead signal in the current decision → flip.
    if (HIGH_CONFIDENCE_DEAD.has(current.reason)) {
        return result(true, 'flip_high_confidence');
    }

    // Low-confidence current dead → need a confirming signal in history.
    if (LOW_CONFIDENCE_DEAD.has(current.reason)) {
        // Any prior HIGH in window confirms strongly.
        const priorHigh = recentReasons.some((r) => HIGH_CONFIDENCE_DEAD.has(r));
        if (priorHigh) return result(true, 'flip_low_plus_high');

        // Two LOW signals (current + at least one prior LOW) confirms.
        const priorLow = recentReasons.some((r) => LOW_CONFIDENCE_DEAD.has(r));
        if (priorLow) return result(true, 'flip_two_low_signals');

        return result(false, 'awaiting_confirmation');
    }

    // current.alive=false but reason is in neither set: treat as low-confidence.
    return result(false, 'awaiting_confirmation');
}

function isDead(reason: HealthReason): boolean {
    return HIGH_CONFIDENCE_DEAD.has(reason) || LOW_CONFIDENCE_DEAD.has(reason);
}

export interface CastVoteOptions {
    voteWindow?: number;
    /** Test seam — bypass DB read by passing history directly. */
    historyOverride?: ReadonlyArray<HealthReason>;
}

/**
 * Production entry point. Reads the most-recent `voteWindow - 1` rows from
 * `job_health_checks` for this job (excluding the current pass — the
 * current decision is fed in directly), and tallies them with `current`.
 */
export async function castFlipVote(
    prisma: PrismaClient,
    jobId: string,
    current: HealthDecision,
    options: CastVoteOptions = {},
): Promise<VoteResult> {
    const window = options.voteWindow ?? DEFAULT_VOTE_WINDOW;

    // Short-circuit when the caller supplied history (tests, dry-runs).
    if (options.historyOverride !== undefined) {
        return tally(current, options.historyOverride.slice(0, Math.max(0, window - 1)));
    }

    // Audit rows for the current pass have already been staged by the
    // recorder, but they may not be flushed yet. Read what's persisted.
    const rows = await prisma.jobHealthCheck.findMany({
        where: { jobId },
        select: { outcome: true },
        orderBy: { checkedAt: 'desc' },
        take: Math.max(0, window - 1),
    });
    const reasons: HealthReason[] = rows
        .map((r) => r.outcome as HealthReason)
        .filter(isAcceptableReason);
    return tally(current, reasons);
}

const VALID_REASONS: ReadonlySet<HealthReason> = new Set([
    'alive_2xx',
    'alive_greenhouse_api',
    'http_404',
    'http_410',
    'soft_404',
    'greenhouse_api_404',
    'inconclusive_403',
    'inconclusive_429',
    'inconclusive_5xx',
    'inconclusive_3xx_loop',
    'inconclusive_network',
    'inconclusive_other',
]);

function isAcceptableReason(value: string): value is HealthReason {
    return VALID_REASONS.has(value as HealthReason);
}
