/**
 * lib/pseo/render-gate.ts — pure, dependency-free render gate for category×city
 * pSEO pages (S4).
 *
 * Below MIN_JOBS_FOR_CATEGORY_CITY a combo is thin doorway content: near-identical
 * markup across thousands of URLs with no ranking equity. A meta-robots noindex is
 * not enough (Google still crawls and may not honor it on doorway pages), so the
 * page calls notFound() instead.
 *
 * Threshold = 3, aligned with the city page (app/jobs/city/[slug]/page.tsx), the
 * sitemap gate, and the seo_threshold_decision.md project memory (do NOT raise).
 */

export const MIN_JOBS_FOR_CATEGORY_CITY = 3;

export function shouldRenderCategoryCity(
  jobCount: number,
  threshold: number = MIN_JOBS_FOR_CATEGORY_CITY,
): boolean {
  return jobCount >= threshold;
}
