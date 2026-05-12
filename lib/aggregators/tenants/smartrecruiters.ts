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

    // === ADDED 2026-05-12 — prod DB discovery (scripts/discover-ats-tenants-from-db.ts) ===
    // Live boards confirmed via scripts/probe-greenhouse-smartrecruiters-candidates.ts.
    { slug: 'ahrcnyc1', name: 'AHRC NYC' },                                                // 1/72 live (24 historical)
    { slug: 'smitharnoldpartners', name: 'Smith Arnold Partners' },                        // 7/10 live — recruiter firm
    { slug: 'vericare', name: 'Vericare' },                                                // 1/2 live
    { slug: 'covista', name: 'Covista' },                                                  // 302 total / 0 PMHNP at probe (35 historical) — monitor
    { slug: 'northwesternmedicine', name: 'Northwestern Memorial Healthcare' },            // 1213 total / 0 PMHNP at probe (31 historical) — monitor
];
