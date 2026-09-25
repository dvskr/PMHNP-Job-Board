/**
 * lib/pseo/related-cities.ts — pure eligibility filter for the "Related cities"
 * sidebar on city pages (#4).
 *
 * The sidebar used to link to any neighboring city, including ones with 1-2 jobs
 * — but those city pages call notFound() (the page's own MIN_JOBS = 3 gate), so
 * the sidebar was actively linking to URLs it knows will 404. Internal links to
 * 404s waste crawl budget and look like broken links in GSC. This filter keeps
 * the threshold identical to the page's render gate so a linked city always renders.
 */
import { getMetroCity } from '@/lib/metro-data';
import { MIN_JOBS_FOR_CATEGORY_CITY } from './render-gate';

/** In lockstep with the city page's MIN_JOBS render gate — same SSOT constant. */
export const MIN_RELATED_CITY_JOBS = MIN_JOBS_FOR_CATEGORY_CITY;

export function selectEligibleCities<T extends { city: string | null; count: number }>(
  rows: readonly T[],
  currentCity: string,
  limit: number,
  minJobs: number = MIN_RELATED_CITY_JOBS,
): T[] {
  const current = currentCity.trim().toLowerCase();
  return rows
    .filter(
      (r) =>
        !!r.city &&
        r.city.trim().length > 0 &&
        r.city.toLowerCase() !== current &&
        r.count >= minJobs,
    )
    .slice(0, limit);
}

/**
 * The URL a city slug should be linked as.
 *
 * /jobs/city/{slug} 308-redirects to /jobs/metro/{slug} for the ten curated
 * metros (app/jobs/city/[slug]/page.tsx). Linking the redirecting URL costs a
 * crawl hop and shows up in GSC as an internal "Page with redirect", so link
 * the destination directly. Everything else keeps the generic city URL.
 *
 * Callers must still apply the count gate (selectEligibleCities or
 * MIN_RELATED_CITY_JOBS) first: this resolves *which* URL, not *whether*.
 */
export function cityLinkHref(citySlug: string): string {
  const slug = citySlug.trim().toLowerCase();
  return getMetroCity(slug) ? `/jobs/metro/${slug}` : `/jobs/city/${slug}`;
}
