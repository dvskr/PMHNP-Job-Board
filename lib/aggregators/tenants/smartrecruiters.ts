/**
 * SmartRecruiters tenant config.
 *
 * Extracted 2026-05-05 from lib/aggregators/smartrecruiters.ts so the
 * adapter can stay focused on fetch logic. Edit this file to add or
 * remove a company.
 *
 * Each entry is a SmartRecruiters company identifier (slug) plus its
 * display name. Slug appears in the SmartRecruiters URL:
 *   https://api.smartrecruiters.com/v1/companies/{slug}/postings
 */

export interface SmartRecruitersTenant {
    slug: string;
    name: string;
}

export const SMARTRECRUITERS_TENANTS: readonly SmartRecruitersTenant[] = [
    // === ADDED 2026-02-20 — Production DB apply_link mining ===
    // 3 with PMHNP jobs in sample
    { slug: 'karecruitinginc', name: 'K.A. Recruiting' },                                // 60 total, 7 PMHNP
    { slug: 'oleskyassociates', name: 'Olesky Associates' },                              // 299 total, 7 PMHNP
    { slug: 'newyorkpsychotherapyandcounselingcenter', name: 'NY Psychotherapy & Counseling' }, // 11 total, 6 PMHNP

    // 3 alive, monitoring for PMHNP
    { slug: 'internationalsosgovernmentmedicalservices', name: 'International SOS' },     // 598 total
    { slug: 'kittitasvalleyhealthcare', name: 'Kittitas Valley Healthcare' },             // 63 total
    { slug: 'mascmedicalrecruitmentfirm', name: 'MASC Medical' },                         // 82 total
];
