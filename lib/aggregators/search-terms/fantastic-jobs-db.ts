/**
 * Fantastic-Jobs-DB (Active Jobs DB via RapidAPI) search terms.
 *
 * Two-pass strategy:
 *   PASS A — TITLE_TERMS: literal title-phrase matches. The API only
 *     accepts a single literal phrase per `title_filter`, so each
 *     variant is its own paginated query. Most variants resolve in
 *     1-3 pages.
 *
 *   PASS B — TITLE_FILTERS_BROAD + DESCRIPTION_FILTER_PSYCH:
 *     title=NP/APRN/APP, description filter widens the catch.
 *     description_filter supports OR.
 *
 * Cost per term: ~5 API calls. Budget cap is 200 calls/run, monthly
 * cap is 20k. Currently using ~80-120/run so plenty of headroom for
 * adding more terms.
 *
 * Edit this file to broaden or tighten coverage. Adapter unchanged.
 */

export const FANTASTIC_TITLE_TERMS: readonly string[] = [
    'PMHNP',
    'Psychiatric Nurse Practitioner',
    'Psychiatric Mental Health Nurse Practitioner',
    'Mental Health Nurse Practitioner',
    'Behavioral Health Nurse Practitioner',
    'Psychiatric APRN',
    'Mental Health APRN',
    'Telepsychiatry',
    'Psychiatric Mental Health',
    'Psych Nurse Practitioner',
    'Psych NP',
    'Child Adolescent Psychiatric Nurse Practitioner',
    'Geriatric Psychiatric Nurse Practitioner',
    'Addiction Psychiatric Nurse Practitioner',
];

export const FANTASTIC_TITLE_FILTERS_BROAD: readonly string[] = [
    'Nurse Practitioner',
    'APRN',
    'Advanced Practice Provider',
];

export const FANTASTIC_DESCRIPTION_FILTER_PSYCH =
    '"psychiatric" OR "mental health" OR "PMHNP" OR "psychiatry" OR "behavioral health" OR "telepsychiatry" OR "suboxone" OR "buprenorphine" OR "addiction medicine" OR "dual diagnosis"';
