/**
 * JazzHR tenant config.
 *
 * Endpoint: https://{slug}.applytojob.com/  (HTML scrape)
 * JazzHR has no public JSON board API — we parse the HTML root page
 * for /apply/{id}/{title-slug} URLs and the surrounding job-title text.
 *
 * Seeded 2026-05-12 from prod DB discovery
 * (scripts/discover-ats-tenants-from-db.ts).
 */

export interface JazzHrTenant {
    slug: string;
    name: string;
}

export const JAZZHR_TENANTS: readonly JazzHrTenant[] = [
    // ── CONFIRMED PMHNP PRODUCERS (historical pmhnp count) ──
    { slug: 'mastercenterforaddictionmedicine', name: 'Master Center for Addiction Medicine' }, // 446
    { slug: 'mindifywellnessandcare', name: 'Mindify Wellness And Care' },                       // 147
    { slug: 'myspectrum', name: 'MySpectrum' },                                                  // 16
    { slug: 'perimeterhealthcare', name: 'Perimeter Healthcare' },                               // 15
    { slug: 'bostonneurobehavioralassociates', name: 'Boston Neurobehavioral Associates' },      // 15
    { slug: 'totalmens', name: 'Total Primary Care' },                                           // 15
    { slug: 'novamedicalservices', name: 'Nova Medical Services' },                              // 15
    { slug: 'cmadc', name: 'Community Medical and Dental Care' },                                // 14
    { slug: 'sambarecovery', name: 'Samba Recovery' },                                           // 14
    { slug: 'marysolmentalhealthexperts', name: 'Mar Y Sol Mental Health' },                     // 14
    { slug: 'eduventionmentoringandcounseling', name: 'Eduvention Mentoring & Counseling' },     // 13
    { slug: 'itrustwellnessgroup', name: 'iTrust Wellness Group' },                              // 11
    { slug: 'addictionrecoverycare', name: 'Addiction Recovery Care' },                          // 7
    { slug: 'brightwayscounselinggroup', name: 'Brightways Counseling Group' },                  // 6
    { slug: 'yourtailormadeseniorservice', name: 'Your Tailormade Senior Service' },             // 6
    { slug: 'onebehavioral', name: 'OneBehavioral' },                                            // 6
    { slug: 'bethanymedical', name: 'Bethany Medical' },                                         // 6
    { slug: 'familyservicesny', name: 'Family Services NY' },                                    // 3
    { slug: 'westriverhealthservices', name: 'West River Health Services' },                    // 1
];
