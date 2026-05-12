/**
 * USAJobs search terms.
 *
 * Each entry becomes one paginated Keyword query against the USAJobs
 * Search API (https://data.usajobs.gov/api/search). All queries are
 * additionally constrained to JobCategoryCode=0610 (Nurse) inside the
 * adapter so we don't have to repeat that filter here.
 *
 * The federal occupational series 0610 captures every nursing role
 * across VA, IHS, BoP, DoD, etc. — combining it with a psychiatric/
 * mental-health keyword is the cleanest way to surface PMHNP-relevant
 * postings without scraping unrelated nursing roles.
 */

export const USAJOBS_SEARCH_QUERIES: readonly string[] = [
    'Psychiatric Mental Health Nurse Practitioner',
    'Psychiatric Nurse Practitioner',
    'Mental Health Nurse Practitioner',
    'Nurse Practitioner Mental Health',
    'Nurse Practitioner Psychiatry',
    'PMHNP',
    'Behavioral Health Nurse Practitioner',
];
