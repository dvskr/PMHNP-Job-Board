/**
 * Probe iCIMS subdomains for an unauthenticated RSS or JSON feed we can
 * use as a fetch source. iCIMS career sites historically expose several
 * feed shapes — we test the common ones against each known tenant and
 * report which (if any) work for free, without auth.
 *
 * Source list seeded from prod DB discovery output 2026-05-12 — only
 * tenants with ≥1 historical PMHNP-relevant title.
 *
 * Read-only. No DB.
 */

interface Candidate {
    slug: string;
    name: string;
    historicalPmhnp: number;
}

// 33 tenants surfaced by scripts/discover-ats-tenants-from-db.ts.
const TENANTS: ReadonlyArray<Candidate> = [
    { slug: 'careers2-universalhealthservices', name: 'UHS Pavilion', historicalPmhnp: 1224 },
    { slug: 'naphcare', name: 'NaphCare', historicalPmhnp: 100 },
    { slug: 'wellpath', name: 'Wellpath', historicalPmhnp: 97 },
    { slug: 'facilityjobs-acadiahealthcare', name: 'Acadia Healthcare (Facility)', historicalPmhnp: 92 },
    { slug: 'acadiahealthcare', name: 'Acadia Healthcare', historicalPmhnp: 87 },
    { slug: 'mindpathhealth', name: 'Mindpath Health', historicalPmhnp: 79 },
    { slug: 'general-careers-curanahealth', name: 'Curana Health (general)', historicalPmhnp: 43 },
    { slug: 'app-career-curanahealth', name: 'Curana Health (app)', historicalPmhnp: 41 },
    { slug: 'jobs1-spectrumhealthcare', name: 'Spectrum Healthcare Resources', historicalPmhnp: 40 },
    { slug: 'hackensackmeridianhealth', name: 'Hackensack Meridian Health', historicalPmhnp: 28 },
    { slug: 'providers-dartmouth-hitchcock', name: 'Dartmouth-Hitchcock', historicalPmhnp: 19 },
    { slug: 'groupsrecovertogether', name: 'Groups Recover Together', historicalPmhnp: 15 },
    { slug: 'physiciansproviders-unitypoint', name: 'UnityPoint', historicalPmhnp: 14 },
    { slug: 'setonchildrens', name: "Seton Children's", historicalPmhnp: 14 },
    { slug: 'externalcareers-ohsu', name: 'OHSU (external)', historicalPmhnp: 14 },
    { slug: 'sevenhills', name: 'Seven Hills', historicalPmhnp: 13 },
    { slug: 'midlandsbehavioralhealth-careers-fundltc', name: 'Midlands Behavioral Health', historicalPmhnp: 13 },
    { slug: 'samaritanvillage', name: 'Samaritan Village', historicalPmhnp: 13 },
    { slug: 'essenmed', name: 'Essen Medical', historicalPmhnp: 12 },
    { slug: 'blueridgehealth', name: 'Blue Ridge Health', historicalPmhnp: 11 },
    { slug: 'umms', name: 'University of Maryland Medical System', historicalPmhnp: 8 },
    { slug: 'devereux', name: 'Devereux', historicalPmhnp: 7 },
    { slug: 'app-baycaremedicalgroup', name: 'BayCare Medical Group (APP)', historicalPmhnp: 7 },
    { slug: 'westcoastuniversity', name: 'West Coast University', historicalPmhnp: 6 },
    { slug: 'advocatesinc', name: 'Advocates Inc', historicalPmhnp: 4 },
    { slug: 'brightviewhealth', name: 'Brightview Health', historicalPmhnp: 3 },
    { slug: 'avancecare', name: 'Avance Care', historicalPmhnp: 1 },
    { slug: 'vhchealth', name: 'VHC Health', historicalPmhnp: 1 },
    { slug: 'providers-reidhealth', name: 'Reid Health', historicalPmhnp: 1 },
    { slug: 'physicians-acadiahealthcare', name: 'Acadia (Physicians)', historicalPmhnp: 1 },
    { slug: 'ucm', name: 'UCM', historicalPmhnp: 1 },
    { slug: 'facultycareers-ohsu', name: 'OHSU (Faculty)', historicalPmhnp: 1 },
    { slug: 'centraldesertbh-careers-fundltc', name: 'Central Desert Behavioral Health', historicalPmhnp: 1 },
];

// Common iCIMS public feed shapes. Order matters — first 200 wins.
const PATTERNS: ReadonlyArray<{ name: string; build: (slug: string) => string }> = [
    { name: 'portal-rss.xml',          build: (s) => `https://${s}.icims.com/jobs/portal-rss.xml` },
    { name: 'jobs/feed/RSS',           build: (s) => `https://${s}.icims.com/jobs/feed/RSS` },
    { name: 'jobs.rss',                build: (s) => `https://${s}.icims.com/jobs.rss` },
    { name: 'jobs/rss',                build: (s) => `https://${s}.icims.com/jobs/rss` },
    { name: 'rss.xml',                 build: (s) => `https://${s}.icims.com/rss.xml` },
    { name: 'rss/portal-rss.xml',      build: (s) => `https://${s}.icims.com/rss/portal-rss.xml` },
    { name: 'jobs/search?rss=1',       build: (s) => `https://${s}.icims.com/jobs/search?ss=1&rss=1` },
    // JSON-ish fallbacks
    { name: 'jobs/intro (HTML)',       build: (s) => `https://${s}.icims.com/jobs/intro` },
];

interface ProbeResult {
    pattern: string;
    url: string;
    status: number;
    contentType: string;
    looksRss: boolean;
    jobCount: number | null;
    snippet: string;
}

async function probeOne(url: string): Promise<{ status: number; ct: string; body: string }> {
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 PMHNP-Hiring-Probe' },
        });
        clearTimeout(t);
        const body = await res.text();
        return { status: res.status, ct: res.headers.get('content-type') ?? '', body };
    } catch (err) {
        return { status: 0, ct: '', body: String(err) };
    }
}

function analyzeBody(body: string): { looksRss: boolean; jobCount: number | null } {
    // Real iCIMS RSS feeds start with <?xml and contain <item> elements.
    const looksRss = body.startsWith('<?xml') && /<item[\s>]/.test(body);
    let jobCount: number | null = null;
    if (looksRss) {
        const matches = body.match(/<item[\s>]/g);
        jobCount = matches ? matches.length : 0;
    }
    return { looksRss, jobCount };
}

async function probeTenant(t: Candidate): Promise<{ tenant: Candidate; results: ProbeResult[]; bestUrl: string | null }> {
    const results: ProbeResult[] = [];
    let bestUrl: string | null = null;
    for (const p of PATTERNS) {
        const url = p.build(t.slug);
        const { status, ct, body } = await probeOne(url);
        const { looksRss, jobCount } = analyzeBody(body);
        results.push({
            pattern: p.name,
            url,
            status,
            contentType: ct,
            looksRss,
            jobCount,
            snippet: body.slice(0, 80).replace(/\s+/g, ' '),
        });
        if (looksRss && !bestUrl) bestUrl = url;
        if (looksRss) break; // Found one — stop probing other patterns
        await new Promise((r) => setTimeout(r, 150));
    }
    return { tenant: t, results, bestUrl };
}

async function main(): Promise<void> {
    console.log(`Probing ${TENANTS.length} iCIMS tenants for public feeds...\n`);
    const all: Array<{ tenant: Candidate; results: ProbeResult[]; bestUrl: string | null }> = [];
    const BATCH = 3;
    for (let i = 0; i < TENANTS.length; i += BATCH) {
        const batch = TENANTS.slice(i, i + BATCH);
        const settled = await Promise.allSettled(batch.map(probeTenant));
        for (const s of settled) {
            if (s.status === 'fulfilled') all.push(s.value);
        }
        await new Promise((r) => setTimeout(r, 300));
    }

    // Sort by feed availability + historical PMHNP volume.
    all.sort((a, b) => {
        if (!!a.bestUrl !== !!b.bestUrl) return a.bestUrl ? -1 : 1;
        return b.tenant.historicalPmhnp - a.tenant.historicalPmhnp;
    });

    console.log('tenant                                              PMHNP   feed-found  best-url');
    console.log('─'.repeat(115));
    for (const r of all) {
        const marker = r.bestUrl ? '★' : ' ';
        const slug = r.tenant.slug.slice(0, 48).padEnd(48);
        const pmhnp = String(r.tenant.historicalPmhnp).padStart(5);
        const feed = r.bestUrl ?? 'NONE';
        const itemCount = r.bestUrl ? r.results.find((x) => x.looksRss)?.jobCount ?? '?' : '';
        console.log(`${marker} ${slug} ${pmhnp}    ${itemCount.toString().padStart(6)}   ${feed}`);
    }

    const found = all.filter((r) => r.bestUrl);
    console.log(`\nWith public feed:  ${found.length} of ${all.length}`);
    console.log(`Historical PMHNP (feed-available tenants only): ${found.reduce((acc, r) => acc + r.tenant.historicalPmhnp, 0)}`);
    console.log(`Historical PMHNP (no-feed tenants — lost):     ${(all.length - found.length) > 0 ? all.filter((r) => !r.bestUrl).reduce((acc, r) => acc + r.tenant.historicalPmhnp, 0) : 0}`);

    if (found.length === 0) {
        console.log('\n=== NEXT STEP ===');
        console.log('No public iCIMS RSS feeds found. Options:');
        console.log('  1. iCIMS HTML scrape per tenant (fragile, anti-bot risk)');
        console.log('  2. iCIMS via Indeed-shared XML feeds (if employers opted into Indeed)');
        console.log('  3. Skip iCIMS — accept the 2,011 historical PMHNP loss');
    }
}

main().catch((err) => {
    console.error('Probe crashed:', err);
    process.exit(1);
});
