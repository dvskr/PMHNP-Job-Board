/**
 * lib/pseo/job-listing-omit.ts — Perf1.
 *
 * pSEO listing pages render job cards that use `descriptionSummary`, never the
 * full multi-KB `description` HTML. Passing this omit to the listing findMany
 * calls drops that column from the SQL SELECT (~60KB/page saved across 10-20
 * rows × 20+ pSEO routes) — the heaviest contributor to pSEO payload size.
 *
 * Runtime object (not `as const`) on purpose: the column exclusion happens at the
 * DB layer regardless of TypeScript inference, so callers keep the full Job type
 * and need no cast.
 */
export const JOB_LISTING_OMIT = { description: true };
