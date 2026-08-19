/**
 * DocCafe search terms.
 *
 * Each entry becomes one RSS query against
 * https://www.doccafe.com/jobs/rss?q={query}. The feed is capped at
 * ~30 items per call, so several targeted keyword variants are needed
 * to maximize PMHNP coverage.
 *
 * Health eCareer Center (healthcareercenter.ts) and Workable
 * (workable.ts, since the 2026-08-19 cursor-pagination fix) reuse this
 * same list — all three respond to the identical PMHNP keyword set.
 *
 * Edit this file to add or remove a search term. Adapter unchanged.
 */

export const DOCCAFE_SEARCH_QUERIES: readonly string[] = [
    'PMHNP',
    'psychiatric mental health nurse practitioner',
    'psychiatric nurse practitioner',
    'mental health nurse practitioner',
    'behavioral health nurse practitioner',
];
