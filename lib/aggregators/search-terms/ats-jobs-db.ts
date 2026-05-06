/**
 * ATS Jobs DB (RapidAPI) search terms.
 *
 * The /v1/jobs/search endpoint accepts a `queries` array which is OR'd
 * server-side, so we can hit all PMHNP variants in a single API call
 * (unlike fantastic-jobs-db which requires one call per literal title).
 * That keeps request volume tiny — important on the Basic plan
 * (100 req/month) where every call counts.
 *
 * Edit this file to broaden / tighten coverage. Adapter unchanged.
 */

export const ATS_JOBS_DB_QUERIES: readonly string[] = [
    'PMHNP',
    'Psychiatric Nurse Practitioner',
    'Psychiatric Mental Health Nurse Practitioner',
    'Mental Health Nurse Practitioner',
    'Behavioral Health Nurse Practitioner',
    'Psychiatric APRN',
    'Mental Health APRN',
    'Telepsychiatry Nurse Practitioner',
    'Psych Nurse Practitioner',
    'Psych NP',
];

/**
 * ATS sources we care about — the endpoint can filter to these so we
 * don't pay for jobs from sources we don't trust. greenhouse / lever /
 * ashby / workday all run native scrapers in our pipeline already, but
 * ats-jobs-db sometimes catches roles that the native scrapers miss
 * (boards we haven't enumerated yet).
 */
export const ATS_JOBS_DB_SOURCES: readonly string[] = [
    'greenhouse',
    'lever',
    'ashby',
    'workday',
    'smartrecruiters',
    'recruitee',
    'breezy',
    'workable',
];
