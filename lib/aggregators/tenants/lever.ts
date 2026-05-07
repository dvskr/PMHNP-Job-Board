/**
 * Lever tenant config — company slugs + display names.
 *
 * Extracted 2026-05-05 from lib/aggregators/lever.ts so the adapter can
 * stay focused on fetch logic. Edit this file to add or remove a feed.
 *
 * The slug is what appears in the Lever postings URL:
 *   https://api.lever.co/v0/postings/{slug}
 *
 * The name override (`LEVER_NAMES`) is optional — if missing, the
 * adapter title-cases the slug.
 */

export const LEVER_SLUGS: readonly string[] = [
    // === VERIFIED — Have PMHNP jobs ===
    'lifestance',          // LifeStance Health — 100+ PMHNP jobs (BIGGEST SOURCE)
    'synapticure',         // Synapticure — 1 PMHNP job
    'ucsf',                // UCSF — 1 PMHNP job
    'talkiatry',           // Talkiatry — 59 PMHNP jobs
    'includedhealth',      // Included Health — 6 PMHNP jobs
    'lyrahealth',          // Lyra Health — 1 PMHNP job

    // === VERIFIED — Valid, monitoring for PMHNP ===
    'carbonhealth',        // Carbon Health — 0 currently but valid endpoint

    // === ADDED 2026-02-13 — VALID, monitoring for PMHNP ===
    'prosper',             // Prosper — 11 total jobs

    // === ADDED 2026-02-13 — EXPANDED SCAN ===
    'bighealth',           // Big Health — 7 total jobs
    'genesis',             // Genesis — 4 total jobs
    'sesame',              // Sesame — 1 total jobs

    // === PROD DB MINING — 9,295 slugs from 3,602 employers ===
    'mindful',             // Mindful Haven — 5 PMHNP (0 recent)
    'athenapsych',         // AthenaPsych — 4 PMHNP (0 recent)
    'seven-starling',      // Seven Starling — 3 PMHNP (3 recent)
    'beckley-clinical',    // Beckley Clinical — 1 PMHNP
    'arundellodge',        // Arundel Lodge — 1 PMHNP

    // === ADDED 2026-02-16 — Full ATS Discovery (189 companies scanned) ===
    'ro',                  // Ro Health — 40 total jobs
    'advocate',            // Advocate Health — 9 total jobs

    // === ADDED 2026-02-16 — CSV test: 6 new PMHNP-active slugs ===
    'lunaphysicaltherapy', // Luna Physical Therapy — 108 PMHNP
    'guidestareldercare',  // Guidestar Eldercare — 31 PMHNP
    'next-health',         // Next Health — 4 PMHNP
    'ekohealth',           // Eko Health — 1 PMHNP
    'heartbeathealth',     // Heartbeat Health — 1 PMHNP
    'swordhealth',         // Sword Health — 1 PMHNP

    // === Additional healthcare companies ===
    'aledade',
    'clarifyhealth',
    'koalahealth',
    'nimblerx',
    'pointclickcare',
    'salvohealth',
    'vivo-care',
    'wepclinical',
    'zushealth',

    // === ADDED 2026-03-10 — Phase 3 expansion ===
    'mindbloom',           // Mindbloom — ketamine-assisted therapy
];

export const LEVER_NAMES: Record<string, string> = {
    'talkiatry': 'Talkiatry',
    'includedhealth': 'Included Health',
    'lyrahealth': 'Lyra Health',
    'carbonhealth': 'Carbon Health',
    'prosper': 'Prosper',
    'bighealth': 'Big Health',
    'genesis': 'Genesis',
    'sesame': 'Sesame',

    // Added 2026-02-13 (prod DB mining)
    'mindful': 'Mindful Haven',
    'athenapsych': 'AthenaPsych',
    'seven-starling': 'Seven Starling',
    'beckley-clinical': 'Beckley Clinical',
    'arundellodge': 'Arundel Lodge',

    // Added 2026-02-16 (ATS discovery)
    'ro': 'Ro Health',
    'advocate': 'Advocate Health',

    // Added 2026-02-16 (CSV test)
    'lunaphysicaltherapy': 'Luna Physical Therapy',
    'guidestareldercare': 'GuideStar Eldercare',
    'next-health': 'Next Health',
    'ekohealth': 'Eko Health',
    'heartbeathealth': 'Heartbeat Health',
    'swordhealth': 'Sword Health',

    // Bulk-added CSV companies
    'cardiosense.com': 'Cardiosense',
    'enter.health': 'ENTER',
    'fishawack.com': 'Avalere Health',
    'h1': 'H1',
    'landmarkbio.com': 'Landmark Bio',
    'medcarehouston.com': 'MedCare Pediatric Group',
    'ollie.com': 'Ollie',
    'outpacebio.com': 'Outpace Bio',
    'peakped.com': 'Peak Pediatric Therapies',
    'simulmedia': 'Simulmedia',
    'theattractiongame.online': 'Furum Jobs',

    // Added 2026-03-10 (Phase 3 expansion)
    'mindbloom': 'Mindbloom',
};
