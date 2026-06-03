/**
 * lib/pseo/jobs-segments-edge.ts
 *
 * Canonical list of valid single-segment `/jobs/<x>` routes — every folder
 * directly under app/jobs/ except the dynamic `[slug]`. Middleware uses this to
 * tell a real taxonomy/namespace page apart from a guessed/garbage URL: a no-UUID
 * `/jobs/<slug>` that isn't in this set is returned as a 410 (Gone) instead of the
 * page route's soft-404 (HTTP 200 + "Page Not Found" body) — the S1 bug.
 *
 * EDGE-SAFE: plain data + a pure function only (middleware runs on the edge runtime;
 * no Node APIs, no heavy imports).
 *
 * DRIFT GUARD: tests/seo/jobs-segments-drift.test.ts asserts this set EXACTLY
 * matches the real app/jobs/ folders, so adding a new category route without
 * updating this list fails CI. That replaces the previous hand-maintained
 * "keep in sync" allowlists the audit flagged as drift-prone.
 */

export const JOBS_TOP_SEGMENTS: ReadonlySet<string> = new Set([
  '1099', 'addiction', 'behavioral-health', 'child-adolescent', 'city',
  'community-health', 'contract', 'correctional', 'crisis', 'edit',
  'entry-level', 'full-time', 'geriatric', 'hospital', 'inpatient',
  'lgbtq', 'locations', 'locum-tenens', 'metro', 'mid-career',
  'new-grad', 'outpatient', 'part-time', 'per-diem', 'private-practice',
  'remote', 'senior', 'state', 'substance-abuse', 'telehealth',
  'travel', 'va', 'veterans',
]);

const UUID_SUFFIX = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;

/**
 * True when a single-segment `/jobs/<slug>` is neither a job-detail page (slug
 * ends with a UUID — that case is handled by the middleware DB-existence check)
 * nor a known taxonomy/namespace route. Such a slug is a guessed/garbage URL and
 * should return 410, not a soft-404.
 */
export function isUnknownJobsTaxonomy(
  slug: string,
  valid: ReadonlySet<string> = JOBS_TOP_SEGMENTS,
): boolean {
  if (UUID_SUFFIX.test(slug)) return false; // job-detail page — not our call
  return !valid.has(slug);
}
