/**
 * lib/pseo/meta-description.ts — SERP-safe description assembly for the two
 * pSEO templates.
 *
 * Both templates concatenated every fact they had into one description and
 * let Google cut it: the setting x state page ran 212 characters and repeated
 * its own label twice, and the category x city page spent its tail on
 * population and cost-of-living figures no searcher types. The page-level
 * builders already in the repo do it the other way round (the city page trims
 * its title past 60, the metro page caps its description at 158), so this is
 * that convention, shared.
 */

/** Google renders roughly 155 to 160 characters of a meta description. */
export const META_DESCRIPTION_LIMIT = 155;

/**
 * Budget for a page title BEFORE app/layout.tsx appends " | PMHNP Hiring".
 * Anything longer and Google truncates, and what it drops is the tail: the
 * state or city the page exists to rank for.
 */
export const TITLE_LIMIT = 60;

/** SERP title for /jobs/{setting}/{state}, shared with the length guard. */
export function settingStateTitle(totalJobs: number, label: string, stateName: string): string {
  return `${totalJobs} ${label} PMHNP Jobs in ${stateName}`;
}

/**
 * Appends each clause only while the whole string stays inside the cap, so a
 * snippet always ends on a sentence instead of an ellipsis. Clauses are
 * passed in priority order: the lead always survives, later ones are dropped
 * whole when they would overflow.
 */
export function buildMetaDescription(lead: string, ...clauses: string[]): string {
  let out = lead;
  for (const clause of clauses) {
    const next = `${out} ${clause}`;
    if (next.length <= META_DESCRIPTION_LIMIT) out = next;
  }
  return out;
}
