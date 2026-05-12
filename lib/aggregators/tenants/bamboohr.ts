/**
 * BambooHR tenant config.
 *
 * Endpoint: https://{slug}.bamboohr.com/careers/list
 * Returns JSON: { meta: { totalCount }, result: [...] }
 * Public, unauthenticated.
 *
 * Seeded 2026-05-12 from prod DB discovery
 * (scripts/discover-ats-tenants-from-db.ts). Each slug appeared in
 * rejected_jobs.applyLink with ≥1 PMHNP-relevant title historically.
 * Live verification happens at adapter run time — a 404 tenant just
 * yields zero jobs, no failure.
 */

export interface BambooHrTenant {
    slug: string;
    name: string;
}

export const BAMBOOHR_TENANTS: readonly BambooHrTenant[] = [
    // ── CONFIRMED PMHNP PRODUCERS (historical pmhnp count from prod scan) ──
    { slug: 'televerohealth', name: 'Televero Health' },                         // 46 pmhnp
    { slug: 'aimergencyconnecthealthcare', name: 'Aimergency Connect Healthcare' },// 39
    { slug: 'personalgrowthcs', name: 'Personal Growth Counseling Services' },   // 28
    { slug: 'freedombehavioralhospitallakecharles', name: 'Freedom Behavioral Hospital (Lake Charles)' }, // 17
    { slug: 'ovphealth', name: 'OVP Health' },                                    // 15
    { slug: 'freedombehavioralhospitalmonroe', name: 'Freedom Behavioral Hospital (Monroe)' }, // 15
    { slug: 'theremedy', name: 'The Remedy' },                                    // 15
    { slug: 'blanchardinstitute', name: 'The Blanchard Institute' },              // 15
    { slug: 'imhealth', name: 'Oregon Integrated Health' },                       // 14
    { slug: 'ondemandrm', name: 'On Demand / New Day Recovery' },                 // 14
    { slug: 'frontrangeclinic', name: 'Front Range Clinic' },                     // 14
    { slug: 'conifercounselingandtherapyservicesinc', name: 'Conifer Counseling & Therapy' }, // 12
    { slug: 'freedombehavioralhospitalplainview', name: 'Freedom Behavioral Hospital (Plainview)' }, // 9
    { slug: 'neurobcg', name: 'Neuro BCG' },                                      // 8
    { slug: 'phoenixbh', name: 'Phoenix Behavioral Health' },                     // 7
    { slug: 'cndcolumbus', name: 'CND Columbus' },                                // 5
    { slug: 'lightcounseling', name: 'Light Counseling' },                        // 5
    { slug: 'gracelandpsychiatry', name: 'Graceland Psychiatry' },                // 3
    { slug: 'greatervalleyhealth1', name: 'Greater Valley Health' },              // 2
    { slug: 'opalfoodandbody', name: 'Opal Food and Body Wisdom' },               // 2
    { slug: 'navabehavioralhealth', name: 'Nava Behavioral Health' },             // 2
    { slug: 'tpcwellness', name: 'TPC Wellness' },                                // 1
    { slug: 'nursepractitioneroncall', name: 'Nurse Practitioner On Call' },      // 1
    { slug: 'kindermind', name: 'Kindermind' },                                   // 1
    { slug: 'epichealthpartners', name: 'Epic Health Partners' },                 // 1
];
