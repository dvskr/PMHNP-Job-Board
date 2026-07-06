/**
 * Single source of truth for the conversion-tier of a job listing.
 *
 * Why this exists: the recommendation algorithm, semantic search ranker, and
 * any other surface that needs to bias toward platform-revenue jobs all need
 * the SAME classification rules. Drift between surfaces (e.g. dashboard
 * recs prefer one definition, search prefers another) silently degrades the
 * platform's revenue moat.
 *
 * Tier hierarchy (highest business priority first):
 *
 *   1. easy_apply  — Employer-posted job that the candidate can apply to
 *                    INSIDE our platform (`apply_on_platform=true`). One
 *                    click, no redirects, we capture the application.
 *                    Highest revenue per slot.
 *
 *   2. direct_apply — Job whose apply link goes STRAIGHT to the employer
 *                     (no aggregator middleman). Either:
 *                       - Employer-posted on our platform but not Easy Apply
 *                       - Aggregator job whose apply_link points to a known
 *                         employer ATS (Greenhouse / Lever / Workday / etc.)
 *                       - Source flagged 'direct' by the ingestion layer
 *                     Less friction than external, no dead-link bingo.
 *
 *   3. external    — Aggregator job that bounces through the aggregator's
 *                    UI before reaching the employer. Higher friction, more
 *                    likely to be stale, and we don't earn revenue from
 *                    surfacing them. Only show when no better option exists.
 *
 * Health: aggregator jobs whose ingestion hasn't seen them in N consecutive
 * runs are likely dead links. We filter those out of recommendations entirely.
 */

import type { Job } from '@/lib/types';

export type JobTier = 'easy_apply' | 'direct_apply' | 'external';

/**
 * Substrings that identify an employer ATS in an applyLink. An aggregator job
 * whose `applyLink` matches one of these is treated as direct_apply (one click
 * to the employer ATS, no aggregator middleman).
 *
 * Exposed so DB-side WHERE builders (lib/job-alerts-service, FeaturedJobsSection)
 * can replicate the filter without having to inline the list. Substring match
 * is sufficient because applyLink hosts are known origins, not arbitrary text.
 *
 * This list is the single source of truth: lib/direct-apply.ts (client-side
 * "Direct Apply" badge), lib/ai/recommendation-policy.ts (re-export for DB
 * WHERE builders), and lib/ai/vector-search.ts (Postgres regex) all derive
 * from it, so every surface agrees on what counts.
 */
export const ATS_HOST_SUBSTRINGS: ReadonlyArray<string> = [
    '.myworkdayjobs.com',
    'greenhouse.io',
    'lever.co',
    'jobs.ashbyhq.com',
    'smartrecruiters.com',
    'icims.com',
    'jazz.co',
    'bamboohr.com',
    'usajobs.gov',
    'apply.workable.com',
    'careers.',
    'jobs.',
];

const ATS_PATTERNS: ReadonlyArray<RegExp> = ATS_HOST_SUBSTRINGS.map(
    (s) => new RegExp(s.replace(/\./g, '\\.'), 'i'),
);

function looksLikeAts(url: string | null | undefined): boolean {
    if (!url) return false;
    return ATS_PATTERNS.some((p) => p.test(url));
}

/**
 * Subset of Job fields the classifier reads. Defining a narrow shape keeps
 * the helper compatible with any caller that selects only the columns it
 * needs (recs cron, dashboard API, search route).
 */
export interface ClassifiableJob {
    sourceType: string | null;
    applyOnPlatform: boolean;
    applyLink?: string | null;
    /**
     * Source-presence streak count from ingestion. Bumped each time the
     * external_id was missing from a successful source ingest. Reset on
     * re-appearance. >= HEALTH_DEAD_THRESHOLD = treat as dead.
     */
    healthConsecutiveMissing?: number | null;
}

/** Aggregator-only safety: when a job has been missed this many ingestions in a row, treat it as dead. */
export const HEALTH_DEAD_THRESHOLD = 3;

export interface JobClassification {
    tier: JobTier;
    /** False when the link is likely dead. Caller should exclude from recs entirely. */
    isHealthy: boolean;
}

/** Pure function — classify a job by its conversion tier and link health. */
export function classifyJob(job: ClassifiableJob): JobClassification {
    // Health: dead-link risk only applies to aggregator (non-employer) jobs.
    // Employer-posted jobs aren't subject to source-presence checks.
    const isEmployerPosted = job.sourceType === 'employer';
    const missing = job.healthConsecutiveMissing ?? 0;
    const isHealthy = isEmployerPosted || missing < HEALTH_DEAD_THRESHOLD;

    // Tier
    let tier: JobTier;
    if (isEmployerPosted && job.applyOnPlatform) {
        tier = 'easy_apply';
    } else if (
        isEmployerPosted ||
        job.sourceType === 'direct' ||
        looksLikeAts(job.applyLink ?? null)
    ) {
        tier = 'direct_apply';
    } else {
        tier = 'external';
    }

    return { tier, isHealthy };
}

/** True iff the job was posted directly by an employer through our platform. */
export function isEmployerPosting(job: Pick<ClassifiableJob, 'sourceType'>): boolean {
    return job.sourceType === 'employer';
}

/** Convenience — true if this job earns its slot in the "platform revenue" sense. */
export function isPlatformRevenueJob(job: ClassifiableJob): boolean {
    const { tier } = classifyJob(job);
    return tier === 'easy_apply' || tier === 'direct_apply';
}

/** Multipliers for soft-boost ranking when slot quotas aren't being used. */
export const TIER_BOOST: Record<JobTier, number> = {
    easy_apply:   1.50,
    direct_apply: 1.20,
    external:     1.00,
};

/**
 * Quota for the standard top-10 recommendation slate.
 *
 * Two product invariants:
 *   1. External (aggregator-bounce) jobs are excluded entirely — every
 *      recommended row goes either to our own apply form (easy_apply) or
 *      straight to the employer's career page / ATS (direct_apply).
 *   2. At least N slots are pinned to `sourceType='employer'` postings,
 *      rotated daily across the live employer pool so different roles
 *      surface across days. Employer postings are our revenue moat —
 *      this guarantees they always have above-the-fold visibility,
 *      whether the candidate's vector match is strong on them or not.
 *
 * `employerPostingReserved` is a best-effort floor: if the live employer
 * pool is empty (or fewer than the floor), we don't pad with externals.
 * The remaining slots fill from any non-external candidate by score.
 */
export const RECOMMENDATION_QUOTA = {
    /** Pin at least this many sourceType='employer' rows when available. */
    employerPostingReserved: 2,
    /** Total slots in a standard rec batch. */
    totalSlots: 10,
} as const;

/**
 * Re-export the type so callers can `import type { JobTier } from '@/lib/types'`-style.
 * (Re-export rather than redefine to keep one source of truth.)
 */
export type { Job };
