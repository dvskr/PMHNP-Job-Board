/**
 * Greenhouse tenant config — slugs + display names.
 *
 * Extracted 2026-05-05 from lib/aggregators/greenhouse.ts so the adapter
 * can stay focused on fetch/pagination logic. Edit this file to add or
 * remove a board.
 *
 * The slug is what appears in the Greenhouse board URL:
 *   https://job-boards.greenhouse.io/{slug}/jobs/{id}
 *
 * The name override (`GREENHOUSE_NAMES`) is optional — if missing, the
 * adapter title-cases the slug.
 */

export const GREENHOUSE_SLUGS: readonly string[] = [
    // ── Trimmed 2026-04-30: dropped 622/622 configured tenants
    // that had never added a PMHNP job. See scripts/audit-greenhouse-tenants.ts
    // and .tmp_greenhouse_tenant_audit.json for the source data.

    // VERIFIED WORKING - Primary sources
    'headway',             // 2 PMHNP jobs
    'modernhealth',        // 1 PMHNP job
    'mantrahealth',        // 1 PMHNP job
    'cerebral',            // 1 PMHNP job (new!)
    'twochairs',           // 3 PMHNP jobs (new!)

    // VERIFIED WORKING - Monitoring (no PMHNP currently)
    'talkspace',           // On Greenhouse, checking regularly
    'ayahealthcare',       // On Greenhouse, checking regularly
    'amwell',              // On Greenhouse, checking regularly
    'octave',              // On Greenhouse, checking regularly
    'growtherapy',         // On Greenhouse, checking regularly

    // === NEW - VERIFIED WITH PMHNP JOBS ===
    'blueskytelepsych',    // Blue Sky Telepsych — 922 PMHNP jobs!
    'bicyclehealth',       // Bicycle Health — 27 PMHNP jobs
    'blackbirdhealth',     // Blackbird Health

    // === NEW - VERIFIED VALID, monitoring for PMHNP ===
    'springhealth66',      // Spring Health — 91 total jobs

    // === ADDED 2026-02-13 — VERIFIED WITH PMHNP JOBS ===
    'betterhelp',          // BetterHelp — 19 PMHNP jobs (18 recent)
    'firsthand',           // Firsthand — 13 PMHNP jobs (2 recent)
    'compasspathways',     // COMPASS Pathways — 11 PMHNP jobs (11 recent)

    // === ADDED 2026-02-13 — VALID, monitoring for PMHNP ===
    'amaehealth',          // Amae Health — 27 total jobs

    // === ADDED 2026-02-13 — EXPANDED SCAN (278 slugs tested) ===
    'bouldercare',         // Boulder Care — 18 PMHNP jobs (18 recent) ⭐

    // === PROD DB MINING — 9,295 slugs from 3,602 employers ===
    'strivehealth',        // Strive Health — 14 PMHNP (14 recent) ⭐
    'medelitellc',         // MedElite LLC — 13 PMHNP (13 recent) ⭐
    'solmentalhealth',     // Sol Mental Health — 10 PMHNP (10 recent) ⭐
    'meditelecare',        // MediTelecare — 7 PMHNP (3 recent)
    'cloverhealth',        // Clover Health — 7 PMHNP (7 recent)
    'prenuvo',             // Prenuvo — 7 PMHNP (5 recent)
    'pineparkhealth',      // Pine Park Health — 6 PMHNP (3 recent)
    'moodhealth',          // Moodhealth — 5 PMHNP (5 recent)
    'compasshealthcenter', // Compass Health Center — 4 PMHNP (4 recent)
    'onemedical',          // One Medical — 4 PMHNP (4 recent)
    'seniordoc',           // Senior Doc — 3 PMHNP (3 recent)
    'ascendhealthcare',    // Ascend Healthcare — 3 PMHNP (3 recent)
    'lonestarcircleofcare',// Lone Star Circle of Care — 3 PMHNP (3 recent)
    'hellobackpack',       // Backpack Healthcare — 3 PMHNP (3 recent)
    'northpointrecoveryholdingsllc', // Northpoint Recovery — 3 PMHNP (3 recent)
    'thejanepauleycommunityhealthcenterinc', // Jane Pauley CHC — 2 PMHNP (2 recent)
    'riviamind',           // RIVIA Mind — 2 PMHNP (1 recent)
    'mentalhealthcenterofdenver', // MH Center of Denver — 1 PMHNP
    'overstoryhealth',     // Overstory Health — 1 PMHNP
    'nursing',             // Nursing Wellness Center — 1 PMHNP
    'tia',                 // Tia — 1 PMHNP

    // === ADDED 2026-02-16 — CSV test: 62 new PMHNP-active slugs ===
    'talkspacepsychiatry', // Talkspace Psychiatry — 50 PMHNP
    'ennoblecare',         // Ennoble Care — 38 PMHNP
    'guidelighthealth',    // Guidelight Health — 24 PMHNP
    'cartwheelcare',       // Cartwheel Care — 15 PMHNP
    'pairteam',            // Pair Team — 14 PMHNP
    'dianahealth94',       // Diana Health — 12 PMHNP
    'vailclinicincdbavailhealthhospital', // Vail Health Hospital — 12 PMHNP
    'folxhealth',          // FOLX Health — 9 PMHNP
    'welbehealth',         // Welbe Health — 7 PMHNP
    'aspirehealthalliance',// Aspire Health Alliance — 5 PMHNP
    'imaginepediatrics',   // Imagine Pediatrics — 3 PMHNP
    'foresightmentalhealth', // Foresight Mental Health — 2 PMHNP
    'khealthcareers',      // K Health — 1 PMHNP

    // === ADDED 2026-02-16 — All live healthcare slugs from CSV ===
    'carrumhealth',
    'hopscotchprimarycare',
    'oshihealth',
    'skildai-careers',

    // === BULK ADD — All remaining CSV companies (480) ===
    'akidolabs',
    'purposemed',
    'silvus-international-opportunites',
    'walleyecapital-external-students',
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

    // New additions
    'twochairs': 'Two Chairs',
    'octave': 'Octave',
    'growtherapy': 'Grow Therapy',

    // New verified additions
    'blueskytelepsych': 'Blue Sky Telepsych',
    'bicyclehealth': 'Bicycle Health',
    'springhealth66': 'Spring Health',
    'omadahealth': 'Omada Health',
    'brave': 'Brave Health',

    // Added 2026-02-13
    'betterhelp': 'BetterHelp',
    'firsthand': 'Firsthand',
    'compasspathways': 'COMPASS Pathways',
    'alma': 'Alma',
    'cortica': 'Cortica',
    'galileo': 'Galileo',
    'amaehealth': 'Amae Health',
    'pelago': 'Pelago',

    // Added 2026-02-13 (expanded scan)
    'bouldercare': 'Boulder Care',
    'daybreakhealth': 'Daybreak Health',
    'parallellearning': 'Parallel Learning',
    'legion': 'Legion',
    'array': 'Array Behavioral Care',
    'neuroflow': 'NeuroFlow',
    'forgehealth': 'Forge Health',
    'iris': 'Iris',

    // Added 2026-02-13 (prod DB mining — 9,295 slugs)
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

    // Added 2026-02-16 (ATS discovery)
    'prosperhealth': 'Prosper Health',
    'pma': 'Pathlight Mood & Anxiety',
    'carbon': 'Carbon Health',
    'veterans': 'Veterans Affairs',
    'summit': 'Summit Healthcare',
    'universal': 'Universal Health Services',
    'calm': 'Calm',

    // Added 2026-02-16 (CSV test — 62 new PMHNP-active slugs)
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

    // Bulk-added CSV companies (continued)
    'wovencare': 'Woven Care',
    'allarahealth': 'Allara Health',
    'eucalyptus': 'Eucalyptus',
    'mavenclinicproviders': 'Maven Clinic',
    'triumvirateenvironmental': 'Triumvirate Environmental',
    'aspirehealthalliance': 'Aspire Health Alliance',
    'lumimeds': 'Lumimeds',
    'seenhealth': 'Seen Health',
    'sensiblecare': 'Sensible Care',
    'cardioone': 'Cardio One',
    'assemblyhealth': 'Assembly Health',
    'bridgebio': 'BridgeBio',
    'cadencehealth': 'Cadence Health',
    'imaginepediatrics': 'Imagine Pediatrics',
    'oncoverycare': 'Oncovery Care',
    'theoncologyinstitute': 'The Oncology Institute',
    'thymecare': 'Thyme Care',
    'allcareers': 'AllCareers',
    'foresightmentalhealth': 'Foresight Mental Health',
    'herselfhealth': 'Herself Health',
    'maplighttherapeutics': 'MapLight Therapeutics',
    'meruhealth': 'Meru Health',
    'sandstonecarebroomfield': 'Sandstone Care Broomfield',
    'sandstonecoloradomedicaldetox': 'Sandstone Care Medical Detox',
    'vardaspace': 'Varda Space',
    'axsometherapeutics': 'Axsome Therapeutics',
    'cadrehospice': 'Cadre Hospice',
    'dynetherapeutics': 'Dyne Therapeutics',
    'found': 'Found Health',
    'habitathealth': 'Habitat Health',
    'kernalbio': 'Kernal Bio',
    'khealthcareers': 'K Health',
    'luminaryhospice': 'Luminary Hospice',
    'pomelocare': 'Pomelo Care',
    'sportandspinephysicaltherapy': 'Sport & Spine Physical Therapy',
    'twinhealth': 'Twin Health',
    'understoodcare': 'Understood Care',
    'vitablehealth': 'Vitable Health',
    'vitahealth': 'Vita Health',
    '10xgenomics': '10x Genomics',
    'adaptivebiotechnologies': 'Adaptive Biotechnologies',
    'freenome': 'Freenome',
    'natera': 'Natera',
    'truepill': 'Truepill',
    'yarrowbiotechnology': 'Yarrow Biotechnology',
};
