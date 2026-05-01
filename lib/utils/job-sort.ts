/**
 * Canonical job sort — single source of truth for the platform's "best" ordering.
 *
 * The same comparator runs on both:
 *   • the DB side  — via Prisma orderBy on every job listing query
 *   • the JS side  — via compareJobsBest() when in-memory re-sorting is needed
 *                    (e.g., merging results across multiple alerts before
 *                    truncating to the email's 10-card display cap)
 *
 * Ranking factors, in order:
 *   1. isFeatured       — paid placement always surfaces first
 *   2. qualityScore     — encodes the +30 employer-posted bonus plus
 *                          link/salary/description/location/freshness signals
 *                          (see lib/utils/quality-score.ts)
 *   3. originalPostedAt — most recent posting date from the source
 *   4. createdAt        — fallback when originalPostedAt is null
 *
 * Pinned by tests in tests/lib/job-sort.test.ts. If you change either side,
 * update both and the test snapshot.
 */
import type { Prisma } from '@prisma/client';

export const BEST_SORT_ORDER_BY: Prisma.JobOrderByWithRelationInput[] = [
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
