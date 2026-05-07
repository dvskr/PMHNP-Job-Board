/**
 * Recommendation policy constants and helpers — what surfaces show, what
 * surfaces hide, and how the platform's own employer postings get pinned
 * across the homepage, dashboard recs, and email alert digests.
 *
 * This file lives next to job-classifier.ts but is intentionally separate
 * because the policy (employer-pinning, ATS host list for DB filters) is
 * shared by surfaces beyond just classification — alert WHERE builders need
 * the ATS host list, the homepage server component needs `isEmployerPosting`,
 * and so on.
 */

import type { ClassifiableJob } from './job-classifier';

/**
 * Substrings that identify an employer ATS in an applyLink. Aggregator jobs
 * whose applyLink matches one of these are classified as direct_apply (one
 * click to the employer ATS, no aggregator middleman).
 *
 * IMPORTANT: keep this list in sync with `ATS_PATTERNS` in
 * lib/ai/job-classifier.ts — the regex form there is the source of truth for
 * client-side classification, this substring form is for DB-side
 * `applyLink contains` filters that can't easily express regex.
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

/** True iff the job was posted directly by an employer through our platform. */
export function isEmployerPosting(job: Pick<ClassifiableJob, 'sourceType'>): boolean {
    return job.sourceType === 'employer';
}

/**
 * Employer-pinning policy applied uniformly across the homepage Top 8,
 * dashboard recommendations, and email alert digests.
 *
 * Two product invariants:
 *   1. External (aggregator-bounce) jobs are excluded entirely — every
 *      surfaced row goes either to our own apply form (easy_apply) or
 *      straight to the employer's career page / ATS (direct_apply).
 *   2. At least `pinned` slots are reserved for `sourceType='employer'`
 *      postings, rotated across days so different roles surface over time.
 *
 * `pinned` is a best-effort floor: if the live employer pool is empty we
 * don't pad with externals — surfaces just fill the rest from the non-
 * external pool by score.
 */
export const EMPLOYER_PIN_POLICY = {
    /** Pin at least this many sourceType='employer' rows when available. */
    pinned: 2,
    /** Total slots filled across the surface. */
    totalSlots: 10,
} as const;
