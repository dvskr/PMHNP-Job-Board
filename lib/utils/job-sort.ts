/**
 * Canonical job sort — single source of truth for the platform's listing order.
 *
 * Every job-LISTING query (the /jobs page + API, all category / state / city /
 * metro / pSEO pages) MUST build its orderBy through `buildJobsOrderBy()` — no
 * inlined arrays — so employer pinning and the SSR-vs-CSR ordering can never
 * drift apart again. (They had: the SSR /jobs page carried its own copy that
 * dropped the employer-first lead, so employer jobs appeared mid-list until the
 * client re-fetched.)
 *
 * The same ordering runs on both:
 *   • the DB side  — via Prisma orderBy on every job listing query
 *   • the JS side  — via compareJobsBest() when in-memory re-sorting is needed
 *                    (e.g., merging results across multiple alerts before
 *                    truncating to the email's 10-card display cap)
 *
 * "best" ranking factors, in order (2026-05-16 revision):
 *   1. employer-posted  — any Job with an EmployerJob row (paid OR free)
 *                          surfaces above aggregated content.
 *   2. isFeatured       — reserved for a hypothetical future premium tier.
 *                          No jobs in the current pricing model set it.
 *   3. qualityScore     — link/salary/description/location/freshness signal.
 *   4. originalPostedAt — most recent posting date from the source.
 *   5. createdAt        — fallback when originalPostedAt is null.
 *
 * Pinned by tests in tests/lib/job-sort.test.ts. If you change either side,
 * update both and the test snapshot.
 */
import type { Prisma } from '@prisma/client';

/** Listing sort modes exposed by the /jobs UI. */
export type JobSort = 'best' | 'newest' | 'salary';

// Leading orderBy key that pins employer-posted rows above aggregated content.
// Decoupled into its own constant so the eventual switch to a denormalized,
// indexed `Job.isEmployerPosted` boolean (which removes the fragile
// NULLS-LAST-on-ASC relation dependency below) is a ONE-LINE change here — flip
// to `{ isEmployerPosted: 'desc' }` once that column ships.
//
// Interim mechanism: `id: 'asc'` on the 1-to-1 EmployerJob relation pushes rows
// with a null EmployerJob (aggregated content) to the bottom, because Postgres
// orders `ASC` with NULLS LAST by default. The asc/desc ordering *among*
// employer-posted rows is irrelevant — the downstream keys tie-break.
export const EMPLOYER_FIRST_KEY: Prisma.JobOrderByWithRelationInput = {
  employerJobs: { id: 'asc' },
};

// Sort-specific tail keys (everything after the optional employer-first lead).
const SORT_TAILS: Record<JobSort, Prisma.JobOrderByWithRelationInput[]> = {
  best: [
    { isFeatured: 'desc' },
    { qualityScore: 'desc' },
    { originalPostedAt: 'desc' },
    { createdAt: 'desc' },
  ],
  newest: [
    { originalPostedAt: { sort: 'desc', nulls: 'last' } },
    { createdAt: 'desc' },
  ],
  salary: [
    { normalizedMaxSalary: { sort: 'desc', nulls: 'last' } },
    { normalizedMinSalary: { sort: 'desc', nulls: 'last' } },
    { createdAt: 'desc' },
  ],
};

/**
 * Single source of truth for a job-listing orderBy.
 *
 * Pinning policy (per sort):
 *   • best   — employer-posted jobs PIN FIRST. The default view (>90% of
 *              traffic) and the placement employers are sold on.
 *   • newest — NO pin. An explicit chronological sort must honor recency, or a
 *              stale employer post would sit above today's jobs and read as a
 *              bug. Employer placement is delivered on the default `best` view.
 *   • salary — NO pin. Pinning would make the salary-sorted column lie.
 *
 * `opts.employerFirst` overrides the per-sort default (force-pin a curated
 * surface, or force-off on `best`).
 */
export function buildJobsOrderBy(
  sort: JobSort = 'best',
  opts: { employerFirst?: boolean } = {},
): Prisma.JobOrderByWithRelationInput[] {
  // Normalize untrusted/unknown sort values (the param comes from the URL) to
  // 'best' so an unrecognized ?sort= falls back to the pinned default order.
  const safeSort: JobSort = sort in SORT_TAILS ? sort : 'best';
  const pin = opts.employerFirst ?? safeSort === 'best';
  return pin ? [EMPLOYER_FIRST_KEY, ...SORT_TAILS[safeSort]] : [...SORT_TAILS[safeSort]];
}

/**
 * Canonical "best" listing order. Thin alias over `buildJobsOrderBy('best')`,
 * kept for the call-sites and tests that reference it by name.
 */
export const BEST_SORT_ORDER_BY: Prisma.JobOrderByWithRelationInput[] =
  buildJobsOrderBy('best');

/**
 * Subset of Job fields the comparator needs. Designed so test fixtures and
 * production code can both satisfy it without dragging in the full Job model.
 */
export interface JobSortable {
  /** True when the job has an EmployerJob row attached (paid OR free
   *  employer post). Tracks the new "employer first" sort criterion. */
  isEmployerPosted?: boolean | null;
  isFeatured?: boolean | null;
  qualityScore?: number | null;
  originalPostedAt?: Date | null;
  createdAt: Date;
}

/**
 * In-memory comparator that mirrors BEST_SORT_ORDER_BY semantics.
 * Returns negative if `a` should come before `b`, positive if after, 0 if equal.
 *
 * Usage: jobs.sort(compareJobsBest)
 */
export function compareJobsBest(a: JobSortable, b: JobSortable): number {
  const aEmployer = a.isEmployerPosted ?? false;
  const bEmployer = b.isEmployerPosted ?? false;
  if (aEmployer !== bEmployer) return aEmployer ? -1 : 1;

  const aFeatured = a.isFeatured ?? false;
  const bFeatured = b.isFeatured ?? false;
  if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;

  const aQuality = a.qualityScore ?? 0;
  const bQuality = b.qualityScore ?? 0;
  if (aQuality !== bQuality) return bQuality - aQuality;

  const aPosted = a.originalPostedAt?.getTime() ?? 0;
  const bPosted = b.originalPostedAt?.getTime() ?? 0;
  if (aPosted !== bPosted) return bPosted - aPosted;

  return b.createdAt.getTime() - a.createdAt.getTime();
}
