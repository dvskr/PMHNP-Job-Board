/**
 * lib/pseo/sitemap-thresholds.ts — single source of truth for the pSEO
 * sitemap gating trio (B7, organic audit 2026-08).
 *
 * Previously /api/sitemaps/index, /api/sitemaps/cities/[batch], and
 * app/sitemap.ts each hand-copied "3 / 10000 / 36" with "keep in sync"
 * comments. This module owns the population floor and staleness window;
 * the job-count floor is re-exported from lib/pseo/render-gate.ts (the
 * MIN_JOBS SSOT — never fork a second constant).
 */

export { MIN_JOBS_FOR_CATEGORY_CITY } from './render-gate';

/**
 * Cities below this population are never advertised in sitemaps, even when
 * they transiently clear the job floor — small towns don't rank on generic
 * queries and churn into crawled-not-indexed.
 */
export const MIN_SITEMAP_POPULATION = 10000;

/**
 * A pseoStats row older than this is treated as unverified: sitemaps stop
 * advertising the URL and page templates fall back to live counts.
 * 36h = 6x the 6h aggregate-pseo cron cadence — several missed runs are
 * tolerated before URLs drop, but a sustained aggregator failure can no
 * longer serve months-stale counts (the April-August 2026 incident).
 */
export const PSEO_STALENESS_HOURS = 36;

/** Cutoff Date for "row is still fresh": updatedAt >= this value. */
export function pseoFreshnessCutoff(now: number = Date.now()): Date {
  return new Date(now - PSEO_STALENESS_HOURS * 60 * 60 * 1000);
}
