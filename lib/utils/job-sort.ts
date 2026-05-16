/**
 * Canonical job sort — single source of truth for the platform's "best" ordering.
 *
 * The same comparator runs on both:
 *   • the DB side  — via Prisma orderBy on every job listing query
 *   • the JS side  — via compareJobsBest() when in-memory re-sorting is needed
 *                    (e.g., merging results across multiple alerts before
 *                    truncating to the email's 10-card display cap)
 *
 * Ranking factors, in order (2026-05-16 revision):
 *   1. employer-posted  — any Job with an EmployerJob row (paid OR free)
 *                          surfaces above aggregated content. Replaced the
 *                          old "isFeatured first" rule so we can stop
 *                          stamping isFeatured on every employer post and
 *                          reserve that flag for a future premium tier.
 *   2. isFeatured       — reserved for a hypothetical future $299/premium
 *                          tier that wants placement above ordinary employer
 *                          posts. No jobs in the current pricing model set it.
 *   3. qualityScore     — encodes link/salary/description/location/freshness
 *                          (see lib/utils/quality-score.ts)
 *   4. originalPostedAt — most recent posting date from the source
 *   5. createdAt        — fallback when originalPostedAt is null
 *
 * Pinned by tests in tests/lib/job-sort.test.ts. If you change either side,
 * update both and the test snapshot.
 */
import type { Prisma } from '@prisma/client';

export const BEST_SORT_ORDER_BY: Prisma.JobOrderByWithRelationInput[] = [
  // Employer-posted first. `id: 'asc'` on a 1-to-1 relation in Prisma 7
  // pushes rows with a null EmployerJob (i.e., aggregated content) to
  // the bottom — Postgres default for `ORDER BY ... ASC` is NULLS LAST.
  // The asc/desc ordering across employer-posted rows is irrelevant here
  // since downstream criteria (isFeatured, qualityScore) tie-break.
  { employerJobs: { id: 'asc' } },
  { isFeatured: 'desc' },
  { qualityScore: 'desc' },
  { originalPostedAt: 'desc' },
  { createdAt: 'desc' },
];

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
