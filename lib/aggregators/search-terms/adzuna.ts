/**
 * Adzuna search terms.
 *
 * Each entry becomes one search query against the Adzuna API. Adzuna's
 * search supports keywords + location filters but each call is a single
 * literal phrase, so each variant is its own paginated query.
 *
 * Adding a term costs ~20 extra API calls per cron run (max 20 pages
 * each at 500ms throttle = ~10s wall-time per term).
 *
 * Edit this file to add or remove a search term. Adapter unchanged.
 */

export const ADZUNA_SEARCH_QUERIES: readonly string[] = [
    'PMHNP',
    'Psychiatric Nurse Practitioner',
    'Psychiatric Mental Health Nurse Practitioner',
    'Behavioral Health Nurse Practitioner',
    'Psychiatric APRN',
    'Psych NP',
    'Mental Health NP',
    'PMHNP-BC',
    'Psychiatric prescriber',
    'Telepsychiatry Nurse Practitioner',
    'Nurse Practitioner Psychiatry',
    'Psychiatric ARNP',
    'Psychiatry Nurse Practitioner',
    'Psychiatric Mental Health NP-BC',
    'New Grad PMHNP',
    'Remote PMHNP',
    'Telehealth Psychiatric Nurse Practitioner',
    'Locum Tenens PMHNP',
    'Travel Psychiatric Nurse Practitioner',
    'Correctional Psychiatric Nurse Practitioner',
    'Inpatient Psychiatric Nurse Practitioner',
    'Outpatient PMHNP',
];
