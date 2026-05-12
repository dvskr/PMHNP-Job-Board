/**
 * Verify the new Workday tenants surfaced by the re-discovery run
 * (scripts/discover-ats-tenants-from-db.ts post-detector-fix). Hits
 * each tenant's CXS endpoint to confirm it responds with a live job
 * board before committing to lib/aggregators/tenants/workday.ts.
 *
 * The CXS endpoint:
 *   https://{slug}.wd{instance}.myworkdayjobs.com/wday/cxs/{slug}/{site}/jobs
 *
 * Read-only. No DB.
 */

interface Candidate {
    slug: string;
    instance: number;
    site: string;
    name: string;
    historicalPmhnp: number;
}

// Top tenants from prod DB scan v2 (Workday section, ≥10 PMHNP).
// Skipped `*|unknown` rows (no parseable site, can't fetch) and
// `trinityhealth|1|unknown` / `sutterhealth|1|unknown` which are
// already configured under different site strings.
const CANDIDATES: ReadonlyArray<Candidate> = [
    { slug: 'ummc', instance: 5, site: 'UMCCareers', name: 'University of Mississippi Medical Center', historicalPmhnp: 58 },
    { slug: 'wustl', instance: 1, site: 'External', name: 'Washington University in St. Louis', historicalPmhnp: 42 },
    { slug: 'stars', instance: 1, site: 'Search', name: 'Stars Behavioral Health Group', historicalPmhnp: 30 },
    { slug: 'pmpediatrics', instance: 5, site: 'BehavioralHealth', name: 'PM Pediatrics', historicalPmhnp: 28 },
    { slug: 'communicarehealth', instance: 1, site: 'CHSExternalCareerSite', name: 'CommuniCare Health Services', historicalPmhnp: 25 },
    { slug: 'tamus', instance: 1, site: 'System-wide_External', name: 'Texas A&M University System (System-wide)', historicalPmhnp: 24 },
    { slug: 'nyp', instance: 1, site: 'nypcareers', name: 'NewYork-Presbyterian Hospital', historicalPmhnp: 23 },
    { slug: 'oregon', instance: 5, site: 'SOR_External_Career_Site', name: 'State of Oregon', historicalPmhnp: 23 },
    { slug: 'ummh', instance: 1, site: 'Careers', name: 'UMass Memorial Health', historicalPmhnp: 21 },
    { slug: 'musc', instance: 1, site: 'MUSC', name: 'Medical University of South Carolina', historicalPmhnp: 17 },
    { slug: 'bilh', instance: 1, site: 'External', name: 'Beth Israel Lahey Health', historicalPmhnp: 16 },
    { slug: 'lvhn', instance: 1, site: 'LVHN', name: 'Lehigh Valley Health Network', historicalPmhnp: 16 },
    { slug: 'methodisthealth', instance: 5, site: 'MLH', name: 'Methodist Le Bonheur Healthcare', historicalPmhnp: 15 },
    { slug: 'stelizabeth', instance: 115, site: 'StElizabethExternalCareerSite', name: 'St. Elizabeth Healthcare', historicalPmhnp: 15 },
    { slug: 'baptistjax', instance: 1, site: 'External_Careers', name: 'Baptist Health (Jacksonville)', historicalPmhnp: 15 },
    { slug: 'searhc', instance: 5, site: 'SEARHC', name: 'SEARHC', historicalPmhnp: 15 },
    { slug: 'nus', instance: 1, site: 'Careers', name: 'National University', historicalPmhnp: 14 },
    { slug: 'broadlawns', instance: 501, site: 'Broadlawns_Careers', name: 'Broadlawns Medical Center', historicalPmhnp: 14 },
    { slug: 'hendricks', instance: 1, site: 'Hendricks_External_Career_Site', name: 'Hendricks Regional Health', historicalPmhnp: 13 },
    { slug: 'waverlyhealthcenter', instance: 12, site: 'WHC', name: 'Waverly Health Center', historicalPmhnp: 13 },
    { slug: 'altru', instance: 503, site: 'careers', name: 'Altru Health System', historicalPmhnp: 13 },
    { slug: 'olemiss', instance: 12, site: 'External__Staff', name: 'University of Mississippi', historicalPmhnp: 12 },
    { slug: 'wgu', instance: 5, site: 'External', name: 'Western Governors University', historicalPmhnp: 11 },
    { slug: 'mhctn', instance: 12, site: 'mhc_careers', name: 'Mental Health Cooperative', historicalPmhnp: 10 },
    { slug: 'cascadia', instance: 12, site: 'cascadiahealth', name: 'Cascadia Health', historicalPmhnp: 10 },
    { slug: 'marywashingtonhealthcare', instance: 5, site: 'Externalcareers', name: 'Mary Washington Healthcare', historicalPmhnp: 9 },
];

async function probe(c: Candidate): Promise<{ status: number; total: number }> {
    const url = `https://${c.slug}.wd${c.instance}.myworkdayjobs.com/wday/cxs/${c.slug}/${c.site}/jobs`;
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(url, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: '' }),
        });
        clearTimeout(t);
        if (!res.ok) return { status: res.status, total: 0 };
        const data = (await res.json()) as { total?: number; jobPostings?: unknown[] };
        return { status: 200, total: data.total ?? 0 };
    } catch {
        return { status: 0, total: 0 };
    }
}

async function main(): Promise<void> {
    console.log(`Verifying ${CANDIDATES.length} Workday tenant candidates live...\n`);
    const results: Array<Candidate & { status: number; total: number }> = [];
    const BATCH = 4;
    for (let i = 0; i < CANDIDATES.length; i += BATCH) {
        const batch = CANDIDATES.slice(i, i + BATCH);
        const settled = await Promise.allSettled(batch.map(probe));
        for (let j = 0; j < settled.length; j++) {
            const s = settled[j];
            const c = batch[j];
            if (s.status === 'fulfilled') {
                results.push({ ...c, ...s.value });
            } else {
                results.push({ ...c, status: 0, total: 0 });
            }
        }
        await new Promise((r) => setTimeout(r, 300));
    }

    console.log('slug                                   inst    site                                  pmhnp_hist  HTTP  total');
    console.log('─'.repeat(125));
    for (const r of results) {
        const marker = r.status === 200 ? '★' : ' ';
        console.log(
            `${marker} ${r.slug.padEnd(36)} ${String(r.instance).padStart(4)}    ${r.site.padEnd(36)} ${String(r.historicalPmhnp).padStart(10)}  ${String(r.status).padStart(4)}  ${String(r.total).padStart(5)}`,
        );
    }

    console.log('\n=== READY TO ADD ===');
    const live = results.filter((r) => r.status === 200);
    for (const r of live) {
        console.log(`    { slug: '${r.slug}', instance: ${r.instance}, site: '${r.site}', name: '${r.name}' },   // ${r.historicalPmhnp} hist / ${r.total} total live`);
    }
    const dead = results.filter((r) => r.status !== 200);
    if (dead.length > 0) {
        console.log('\n=== FAILED PROBES (skip) ===');
        for (const r of dead) {
            console.log(`  ${r.slug}|${r.instance}|${r.site}  HTTP ${r.status}  -- ${r.name}`);
        }
    }
}

main().catch((err) => {
    console.error('Probe crashed:', err);
    process.exit(1);
});
