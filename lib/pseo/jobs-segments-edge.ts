/**
 * lib/pseo/jobs-segments-edge.ts
 *
 * SINGLE SOURCE OF TRUTH for the /jobs category taxonomy. Every consumer list
 * is derived from the JOBS_TAXONOMY registry below instead of being
 * hand-duplicated (the old copies drifted — e.g. behavioral-health went
 * missing from app/sitemap.ts):
 *   - app/sitemap.ts               → PRIMARY_SITEMAP_CATEGORY_SLUGS (inPrimarySitemap)
 *   - middleware.ts                → STATE_ELIGIBLE_CATEGORY_SLUGS / CITY_ELIGIBLE_CATEGORY_SLUGS
 *   - /api/sitemaps/index + cities → CITY_SITEMAP_CATEGORIES (inCitySitemaps)
 *   - /api/cron/index-pseo         → PSEO_INDEXING_CATEGORIES (pseoIndexing)
 *   - middleware 410 gate          → JOBS_TOP_SEGMENTS (registry + namespace roots)
 *
 * JOBS_TOP_SEGMENTS is the canonical set of valid single-segment `/jobs/<x>`
 * routes — every folder directly under app/jobs/ except the dynamic `[slug]`.
 * Middleware uses it to tell a real taxonomy/namespace page apart from a
 * guessed/garbage URL: a no-UUID `/jobs/<slug>` that isn't in this set is
 * returned as a 410 (Gone) instead of the page route's soft-404 (HTTP 200 +
 * "Page Not Found" body) — the S1 bug.
 *
 * EDGE-SAFE: plain data + pure functions only (middleware runs on the edge
 * runtime; no Node APIs, no heavy imports).
 *
 * DRIFT GUARD: tests/seo/jobs-segments-drift.test.ts asserts the registry (and
 * JOBS_TOP_SEGMENTS) EXACTLY matches the real app/jobs/ folders, so adding a
 * new category route without updating this registry fails CI. That replaces
 * the previous hand-maintained "keep in sync" allowlists the audit flagged as
 * drift-prone.
 */

export type JobsTaxonomyGroup =
  | 'setting'
  | 'specialty'
  | 'jobType'
  | 'experience'
  | 'employer'
  | 'population';

export interface JobsTaxonomyEntry {
  /** URL segment: /jobs/<slug> */
  readonly slug: string;
  readonly group: JobsTaxonomyGroup;
  /** Has an app/jobs/<slug>/[state] route — /jobs/<slug>/<state> is a valid shape. */
  readonly stateEligible: boolean;
  /** Has an app/jobs/<slug>/city/[slug] route — /jobs/<slug>/city/<city> is a valid shape. */
  readonly cityEligible: boolean;
  /** Emitted as a /jobs/<slug> landing-page URL in the primary sitemap (app/sitemap.ts). */
  readonly inPrimarySitemap: boolean;
  /** In the batched city-sitemap category surface (/api/sitemaps/index + cities/[batch]). */
  readonly inCitySitemaps: boolean;
  /** Submitted to Google/Bing/IndexNow by /api/cron/index-pseo. */
  readonly pseoIndexing: boolean;
  /**
   * When set, this category's landing page rel=canonicals to /jobs/<canonicalTo>
   * (near-duplicate consolidation). Derived surfaces that canonical UP to the
   * category (e.g. thin category-city pages) must target /jobs/<canonicalTo>
   * directly — pointing at /jobs/<slug> would create a two-hop canonical chain.
   */
  readonly canonicalTo?: string;
}

// Registry order is meaningful: derived lists preserve it, and the primary
// sitemap emits category landing pages in this order (settings → specialties
// → job types → experience → employers → populations).
export const JOBS_TAXONOMY: ReadonlyArray<JobsTaxonomyEntry> = [
  // ── Settings ──────────────────────────────────────────────────────
  { slug: 'remote', group: 'setting', stateEligible: true, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: true, pseoIndexing: true },
  { slug: 'telehealth', group: 'setting', stateEligible: true, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: true, pseoIndexing: true },
  { slug: 'inpatient', group: 'setting', stateEligible: true, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: true, pseoIndexing: true },
  { slug: 'outpatient', group: 'setting', stateEligible: true, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: true, pseoIndexing: true },
  { slug: 'travel', group: 'setting', stateEligible: true, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: true, pseoIndexing: true },
  { slug: 'behavioral-health', group: 'setting', stateEligible: true, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: true, pseoIndexing: true },
  // ── Specialties ───────────────────────────────────────────────────
  { slug: 'addiction', group: 'specialty', stateEligible: true, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: true, pseoIndexing: true },
  { slug: 'child-adolescent', group: 'specialty', stateEligible: false, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: false, pseoIndexing: false },
  // 2026-07: canonicalized to /jobs/addiction — page stays live but only the canonical target is sitemapped
  { slug: 'substance-abuse', group: 'specialty', stateEligible: false, cityEligible: true, inPrimarySitemap: false, inCitySitemaps: false, pseoIndexing: false, canonicalTo: 'addiction' },
  { slug: 'new-grad', group: 'specialty', stateEligible: true, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: true, pseoIndexing: true },
  { slug: 'per-diem', group: 'specialty', stateEligible: false, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: false, pseoIndexing: false },
  { slug: 'locum-tenens', group: 'specialty', stateEligible: false, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: false, pseoIndexing: false },
  { slug: 'correctional', group: 'specialty', stateEligible: true, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: true, pseoIndexing: true },
  { slug: '1099', group: 'specialty', stateEligible: true, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: true, pseoIndexing: true },
  // ── Job types ─────────────────────────────────────────────────────
  { slug: 'full-time', group: 'jobType', stateEligible: true, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: true, pseoIndexing: true },
  { slug: 'part-time', group: 'jobType', stateEligible: true, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: true, pseoIndexing: true },
  { slug: 'contract', group: 'jobType', stateEligible: true, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: true, pseoIndexing: true },
  // ── Experience levels ─────────────────────────────────────────────
  { slug: 'entry-level', group: 'experience', stateEligible: false, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: false, pseoIndexing: false },
  { slug: 'mid-career', group: 'experience', stateEligible: false, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: false, pseoIndexing: false },
  { slug: 'senior', group: 'experience', stateEligible: false, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: false, pseoIndexing: false },
  // ── Employer types ────────────────────────────────────────────────
  { slug: 'hospital', group: 'employer', stateEligible: false, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: false, pseoIndexing: false },
  { slug: 'private-practice', group: 'employer', stateEligible: false, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: false, pseoIndexing: false },
  { slug: 'community-health', group: 'employer', stateEligible: false, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: false, pseoIndexing: false },
  { slug: 'va', group: 'employer', stateEligible: false, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: false, pseoIndexing: false },
  // ── Populations ───────────────────────────────────────────────────
  { slug: 'geriatric', group: 'population', stateEligible: false, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: false, pseoIndexing: false },
  { slug: 'veterans', group: 'population', stateEligible: false, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: false, pseoIndexing: false },
  { slug: 'lgbtq', group: 'population', stateEligible: false, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: false, pseoIndexing: false },
  { slug: 'crisis', group: 'population', stateEligible: false, cityEligible: true, inPrimarySitemap: true, inCitySitemaps: false, pseoIndexing: false },
];

const slugsWhere = (pred: (entry: JobsTaxonomyEntry) => boolean): ReadonlyArray<string> =>
  JOBS_TAXONOMY.filter(pred).map((entry) => entry.slug);

/** Taxonomies with an app/jobs/<slug>/[state] route (middleware state-shape gate). */
export const STATE_ELIGIBLE_CATEGORY_SLUGS = slugsWhere((e) => e.stateEligible);

/** Taxonomies with an app/jobs/<slug>/city/[slug] route (middleware city-shape gate). */
export const CITY_ELIGIBLE_CATEGORY_SLUGS = slugsWhere((e) => e.cityEligible);

/** Category landing slugs emitted by the primary sitemap (app/sitemap.ts). */
export const PRIMARY_SITEMAP_CATEGORY_SLUGS = slugsWhere((e) => e.inPrimarySitemap);

/** Category surface for /api/sitemaps/index + /api/sitemaps/cities/[batch]. */
export const CITY_SITEMAP_CATEGORIES = slugsWhere((e) => e.inCitySitemaps);

/** Categories the index-pseo cron submits to Google/Bing/IndexNow. */
export const PSEO_INDEXING_CATEGORIES = slugsWhere((e) => e.pseoIndexing);

/**
 * Non-taxonomy namespace roots under app/jobs/ — dynamic-route containers
 * (city/state/metro/edit) plus the /jobs/locations directory page. Valid as a
 * first segment after /jobs/, but not categories.
 */
export const JOBS_NAMESPACE_SEGMENTS: ReadonlyArray<string> = [
  'city', 'edit', 'locations', 'metro', 'state',
];

export const JOBS_TOP_SEGMENTS: ReadonlySet<string> = new Set([
  ...JOBS_TAXONOMY.map((entry) => entry.slug),
  ...JOBS_NAMESPACE_SEGMENTS,
]);

/**
 * Where /jobs/<slug> canonical signals should point: the slug itself, unless
 * the registry entry names a canonicalTo target (near-duplicate categories,
 * e.g. substance-abuse → addiction). Surfaces that canonical UP to a category
 * must use this so they never target the non-canonical page (two-hop chain).
 */
export function categoryCanonicalTarget(slug: string): string {
  const entry = JOBS_TAXONOMY.find((t) => t.slug === slug);
  return entry?.canonicalTo ?? slug;
}

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
