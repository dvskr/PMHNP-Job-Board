/**
 * Ashby tenant config — org slugs + display names.
 *
 * Endpoint shape:
 *   https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true
 *
 * Public unauthenticated API. No key required.
 *
 * Seeded 2026-05-12 from scripts/discover-ashby-tenants.ts. The probe
 * ran 68 candidate healthcare/mental-health slugs and these were the
 * ones with a live Ashby board AND ≥1 PMHNP-relevant title at probe
 * time. Re-run the discovery script whenever adding new slugs.
 */

export interface AshbyTenant {
    slug: string;
    name: string;
}

export const ASHBY_TENANTS: readonly AshbyTenant[] = [
    // ── CONFIRMED PMHNP PRODUCERS (probe 2026-05-12) ──
    { slug: 'bravehealth', name: 'Brave Health' },           // 3 PMHNP / 26 total
    { slug: 'equip', name: 'Equip Health' },                  // 4 NP-eating-disorder roles / 38 total

    // ── ADDED 2026-05-12 — prod DB discovery (scripts/discover-ats-tenants-from-db.ts) ──
    // Slugs surfaced from rejected_jobs.applyLink, then live-probed via
    // scripts/probe-ashby-candidates.ts. All confirmed responding 200
    // with ≥1 PMHNP-relevant title at probe time.
    { slug: 'sondermind', name: 'SonderMind' },              // 46/147 — biggest catch; migrated off Greenhouse
    { slug: 'talkiatry', name: 'Talkiatry' },                // 53/176 — migrated off Lever
    { slug: 'reklamehealth', name: 'Reklame Health' },       // 3/6
    { slug: 'legionhealth', name: 'Legion Health' },         // 3/9
    { slug: 'claritypediatrics', name: 'Clarity Pediatrics' },// 2/11
    { slug: 'blossom-health', name: 'Blossom Health' },      // 1/16
    { slug: 'salma-health', name: 'Salma Health' },          // 2/14
    { slug: 'hellobrightline', name: 'Brightline' },         // 3/24
    { slug: 'third-space-therapy', name: 'Third Space Therapy' }, // 2/26
    { slug: 'sunflower-sober', name: 'Sunflower Sober' },    // 1/2

    // ── LIVE BOARD, MONITORING for PMHNP ──
    // Mental-health focused boards with active postings but 0 PMHNP at
    // probe time. Worth scanning each cron so we catch PMHNP postings
    // the day they go up.
    { slug: 'rula', name: 'Rula Health' },                    // 27 total / 0 PMHNP at probe
    { slug: 'array-behavioral-care', name: 'Array Behavioral Care' }, // 30 total / 0 PMHNP at probe
];
