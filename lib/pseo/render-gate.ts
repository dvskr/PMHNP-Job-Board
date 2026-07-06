/**
 * lib/pseo/render-gate.ts — pure, dependency-free render gate for category×city
 * pSEO pages (S4).
 *
 * Below MIN_JOBS_FOR_CATEGORY_CITY a combo is thin doorway content: near-identical
 * markup across thousands of URLs with no ranking equity. A meta-robots noindex is
 * not enough (Google still crawls and may not honor it on doorway pages), so the
 * page calls notFound() instead.
 *
 * Threshold = 3, per the seo_threshold_decision.md project memory (do NOT raise).
 * MIN_JOBS_FOR_CATEGORY_CITY is the single source of truth — it is imported by
 * the city page (app/jobs/city/[slug]/page.tsx), the category×city template,
 * related-cities, both sitemap emitters, the index-pseo cron, and the
 * audit-city-pages script. Change the value here and every gate moves together.
 */

export const MIN_JOBS_FOR_CATEGORY_CITY = 3;

export function shouldRenderCategoryCity(
  jobCount: number,
  threshold: number = MIN_JOBS_FOR_CATEGORY_CITY,
): boolean {
  return jobCount >= threshold;
}
