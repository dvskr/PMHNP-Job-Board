/**
 * Workday search terms.
 *
 * Each entry becomes one paginated `searchText` POST against every
 * tenant's /wday/cxs/{slug}/{site}/jobs endpoint — cast a wide net,
 * let isRelevantJob filter precisely.
 *
 * Adding a term multiplies calls across ~95 tenants (tenants/workday.ts),
 * so keep this list tight.
 *
 * Edit this file to add or remove a search term. Adapter unchanged.
 */

export const WORKDAY_SEARCH_TERMS: readonly string[] = [
    'Psychiatric Nurse Practitioner',
    'PMHNP',
    'Psychiatric Mental Health',
    'Behavioral Health Nurse Practitioner',
    'Psychiatric APRN',
    'Psych NP',
];
