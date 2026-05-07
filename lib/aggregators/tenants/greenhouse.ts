/**
 * Greenhouse tenant config — slugs + display names.
 *
 * Trimmed 2026-05-05 from 63 → 50 slugs based on a 180-day production
 * audit. Slugs that hadn't added a single PMHNP job in 6 months were
 * dropped to cut compute (greenhouse fetches were 86k/wk for 47 adds —
 * 0.054% pass rate). The 50 keepers all had ≥1 hit in last 180d.
 *
 * If a dropped slug starts producing again later, add it back here.
 *
 * Slug appears in greenhouse URLs:
 *   https://job-boards.greenhouse.io/{slug}/jobs/{id}
 *
 * The name override (`GREENHOUSE_NAMES`) is optional — if missing, the
 * adapter title-cases the slug.
 */

export const GREENHOUSE_SLUGS: readonly string[] = [
    // ── HIGH PRODUCERS (≥10 jobs/180d) ──
    'blueskytelepsych',                       // 200/180d, last 2026-05-01
    'talkspacepsychiatry',                    // 51/180d, last 2026-03-27
    'sondermind',                             // 42/180d, last 2026-02-13
    'blackbirdhealth',                        // 21/180d, last 2026-05-05
    'betterhelp',                             // 20/180d, last 2026-04-30
    'solmentalhealth',                        // 17/180d, last 2026-04-30
    'moodhealth',                             // 13/180d, last 2026-04-11
    'compasspathways',                        // ~10+ via externalId pattern
    'onemedical',                             // ~10 via externalId pattern
    'ascendhealthcare',                       // 10/180d, last 2026-04-29

    // ── MID PRODUCERS (4–9 jobs/180d) ──
    'tia',                                    // 9/180d, last 2026-05-02
    'ennoblecare',                            // 7/180d, last 2026-04-29
    'meditelecare',                           // 7/180d, last 2026-04-29
    'hellobackpack',                          // 6/180d, last 2026-03-12
    'firsthand',                              // 5/180d, last 2026-03-21
    'compasshealthcenter',                    // 5/180d, last 2026-04-29
    'guidelighthealth',                       // 4/180d, last 2026-04-30
    'akidolabs',                              // 4/180d, last 2026-04-29
    'headway',                                // 4/180d, last 2026-04-18
    'cloverhealth',                           // 4/180d, last 2026-02-14
    'strivehealth',                           // 4/180d, last 2026-03-25
    'northpointrecoveryholdingsllc',          // 4/180d, last 2026-04-10
    'charliehealth',                          // ~4 via externalId pattern

    // ── LOW PRODUCERS (1–3 jobs/180d) — kept for coverage ──
    'amaehealth',                             // 3/180d
    'pineparkhealth',                         // 3/180d
    'mentalhealthcenterofdenver',             // 3/180d
    'cartwheelcare',                          // 2/180d
    'seniordoc',                              // 2/180d
    'aspirehealthalliance',                   // 2/180d
    'overstoryhealth',                        // 1/180d
    'oshihealth',                             // 1/180d
    'folxhealth',                             // 1/180d
    'nursing',                                // 1/180d
    'hopscotchprimarycare',                   // 1/180d
    'thejanepauleycommunityhealthcenterinc',  // 1/180d
    'welbehealth',                            // 1/180d
    'dianahealth94',                          // 1/180d
    'bouldercare',                            // 1/180d
    'vailclinicincdbavailhealthhospital',     // 1/180d
    'imaginepediatrics',                      // 1/180d
    'khealthcareers',                         // 1/180d
    'medelitellc',                            // 1/180d
    'valerahealth',                           // 1/180d
    'mantrahealth',                           // 1/180d (last 2025-12-15 — borderline)
    'lonestarcircleofcare',                   // 1/180d
    'pairteam',                               // 1/180d
    'bicyclehealth',                          // ~1 via externalId pattern
    'carrumhealth',                           // ~1 via externalId pattern
    'foresightmentalhealth',                  // ~1 via externalId pattern

    // ── DROPPED 2026-05-05 (no PMHNP adds in last 180d) ──
    // modernhealth, cerebral, twochairs, talkspace, ayahealthcare, amwell,
    // octave, growtherapy, springhealth66, prenuvo, riviamind, skildai-careers,
    // purposemed, silvus-international-opportunites, walleyecapital-external-students
    // If any restart producing, re-add to the list above.
];

export const GREENHOUSE_NAMES: Record<string, string> = {
    // Verified companies
    'talkspace': 'Talkspace',
    'modernhealth': 'Modern Health',
    'cerebral': 'Cerebral',
    'headway': 'Headway',
    'amwell': 'Amwell',
    'ayahealthcare': 'Aya Healthcare',
    'mantrahealth': 'Mantra Health',
    'twochairs': 'Two Chairs',
    'octave': 'Octave',
    'growtherapy': 'Grow Therapy',
    'blueskytelepsych': 'Blue Sky Telepsych',
    'bicyclehealth': 'Bicycle Health',
    'springhealth66': 'Spring Health',
    'omadahealth': 'Omada Health',
    'brave': 'Brave Health',
    'betterhelp': 'BetterHelp',
    'firsthand': 'Firsthand',
    'compasspathways': 'COMPASS Pathways',
    'alma': 'Alma',
    'cortica': 'Cortica',
    'galileo': 'Galileo',
    'amaehealth': 'Amae Health',
    'pelago': 'Pelago',
    'bouldercare': 'Boulder Care',
    'daybreakhealth': 'Daybreak Health',
    'parallellearning': 'Parallel Learning',
    'legion': 'Legion',
    'array': 'Array Behavioral Care',
    'neuroflow': 'NeuroFlow',
    'forgehealth': 'Forge Health',
    'iris': 'Iris',
    'strivehealth': 'Strive Health',
    'medelitellc': 'MedElite LLC',
    'solmentalhealth': 'Sol Mental Health',
    'meditelecare': 'MediTelecare',
    'cloverhealth': 'Clover Health',
    'prenuvo': 'Prenuvo',
    'pineparkhealth': 'Pine Park Health',
    'moodhealth': 'Moodhealth',
    'compasshealthcenter': 'Compass Health Center',
    'onemedical': 'One Medical',
    'seniordoc': 'Senior Doc',
    'ascendhealthcare': 'Ascend Healthcare',
    'lonestarcircleofcare': 'Lone Star Circle of Care',
    'hellobackpack': 'Backpack Healthcare',
    'northpointrecoveryholdingsllc': 'Northpoint Recovery',
    'thejanepauleycommunityhealthcenterinc': 'Jane Pauley Community Health Center',
    'riviamind': 'RIVIA Mind',
    'mentalhealthcenterofdenver': 'Mental Health Center of Denver',
    'overstoryhealth': 'Overstory Health',
    'nursing': 'Nursing Wellness Center',
    'vitalcaringgroup': 'VitalCaring Group',
    'peregrinehealth': 'Peregrine Health',
    'tia': 'Tia',
    'lts': 'LTS',
    'prosperhealth': 'Prosper Health',
    'pma': 'Pathlight Mood & Anxiety',
    'carbon': 'Carbon Health',
    'veterans': 'Veterans Affairs',
    'summit': 'Summit Healthcare',
    'universal': 'Universal Health Services',
    'calm': 'Calm',
    'theoriamedical': 'Theoria Medical',
    'talkspacepsychiatry': 'Talkspace Psychiatry',
    'midihealth': 'Midi Health',
    'luminishealth': 'Luminis Health',
    'ennoblecare': 'Ennoble Care',
    'integrityrehabgroup': 'Integrity Rehab Group',
    'formhealth': 'Form Health',
    'guidelighthealth': 'Guidelight Health',
    'optimalcare': 'Optimal Care',
    'cartwheelcare': 'Cartwheel Care',
    'healthlink': 'HealthLink',
    'engageseniortherapy': 'Engage Senior Therapy',
    'pairteam': 'Pair Team',
    'sollishealth': 'Sollis Health',
    'dianahealth94': 'Diana Health',
    'vailclinicincdbavailhealthhospital': 'Vail Health Hospital',
    'axisteletherapy': 'Axis Teletherapy',
    'folxhealth': 'FOLX Health',
    'neurahealth': 'Neura Health',
    'centrumhealth': 'Centrum Health',
    'reemahealth': 'Reema Health',
    'welbehealth': 'Welbe Health',
    'sondermind': 'SonderMind',
    'blackbirdhealth': 'Blackbird Health',
    'akidolabs': 'Akido Labs',
    'oshihealth': 'Oshi Health',
    'hopscotchprimarycare': 'Hopscotch Primary Care',
    'imaginepediatrics': 'Imagine Pediatrics',
    'khealthcareers': 'K Health',
    'valerahealth': 'Valera Health',
    'charliehealth': 'Charlie Health',
    'foresightmentalhealth': 'Foresight Mental Health',
    'carrumhealth': 'Carrum Health',
};
