/**
 * Test all 938 healthcare-relevant ATS slugs from the CSV
 * Probes each slug against its respective ATS platform API
 * Reports which are live and which return PMHNP-relevant jobs
 */

import * as fs from 'fs';
import * as path from 'path';

const CSV_PATH = path.join(__dirname, '..', 'public', 'resume', 'final_healthcare_ats_all_sources_2026.csv');

// PMHNP relevance keywords
const PMHNP_KEYWORDS = [
    'pmhnp', 'psychiatric', 'psychiatry', 'mental health', 'behavioral health',
    'nurse practitioner', 'psych np', 'psych nurse', 'behavioral', 'substance',
    'addiction', 'counselor', 'therapist', 'licensed clinical', 'lcsw', 'lmft',
    'telehealth', 'tele-health', 'remote.*nurse', 'aprn', 'np ', ' np,',
    'prescriber', 'medication management', 'outpatient psych',
];

const PMHNP_RE = new RegExp(PMHNP_KEYWORDS.join('|'), 'i');

// Healthcare slug filter
const HEALTH_RE = /health|medical|hospital|clinic|care|therap|psych|mental|nurse|rehab|wellness|behavioral|hospice|telehealth|pharma|dental|pediatr|oncol|neuro|cardio|counsel/i;

interface CsvRow {
    company: string;
    slug: string;
    platform: string;
    sector: string;
    url: string;
    source: string;
}

interface TestResult {
    company: string;
    slug: string;
    platform: string;
    sector: string;
    source: string;
    status: 'live' | 'dead' | 'error';
    totalJobs: number;
    pmhnpJobs: number;
    sampleTitles: string[];
}

function parseCsv(filepath: string): CsvRow[] {
    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split('\n').slice(1); // Skip header
    const rows: CsvRow[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Handle CSV with potential commas in company names (quoted)
        const parts: string[] = [];
        let current = '';
        let inQuotes = false;
        for (const char of trimmed) {
            if (char === '"') { inQuotes = !inQuotes; continue; }
            if (char === ',' && !inQuotes) { parts.push(current); current = ''; continue; }
            current += char;
        }
        parts.push(current);

        if (parts.length >= 3) {
            rows.push({
                company: parts[0]?.trim() || '',
                slug: parts[1]?.trim() || '',
                platform: parts[2]?.trim() || '',
                sector: parts[3]?.trim() || '',
                url: parts[4]?.trim() || '',
                source: parts[5]?.trim() || '',
            });
        }
    }
    return rows;
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================= PLATFORM TESTERS =========================

async function testGreenhouse(slug: string): Promise<{ totalJobs: number; pmhnpJobs: number; titles: string[] }> {
    try {
        const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, {
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return { totalJobs: 0, pmhnpJobs: 0, titles: [] };
        const data = await res.json() as { jobs?: Array<{ title: string }> };
        const jobs = data.jobs || [];
        const pmhnp = jobs.filter((j: { title: string }) => PMHNP_RE.test(j.title));
        return { totalJobs: jobs.length, pmhnpJobs: pmhnp.length, titles: pmhnp.slice(0, 3).map((j: { title: string }) => j.title) };
    } catch { return { totalJobs: 0, pmhnpJobs: 0, titles: [] }; }
}

async function testLever(slug: string): Promise<{ totalJobs: number; pmhnpJobs: number; titles: string[] }> {
    try {
        const res = await fetch(`https://api.lever.co/v0/postings/${slug}`, {
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return { totalJobs: 0, pmhnpJobs: 0, titles: [] };
        const jobs = await res.json() as Array<{ text: string }>;
        if (!Array.isArray(jobs)) return { totalJobs: 0, pmhnpJobs: 0, titles: [] };
        const pmhnp = jobs.filter((j: { text: string }) => PMHNP_RE.test(j.text));
        return { totalJobs: jobs.length, pmhnpJobs: pmhnp.length, titles: pmhnp.slice(0, 3).map((j: { text: string }) => j.text) };
    } catch { return { totalJobs: 0, pmhnpJobs: 0, titles: [] }; }
}

async function testAshby(slug: string): Promise<{ totalJobs: number; pmhnpJobs: number; titles: string[] }> {
    try {
        const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, {
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return { totalJobs: 0, pmhnpJobs: 0, titles: [] };
        const data = await res.json() as { jobs?: Array<{ title: string }> };
        const jobs = data.jobs || [];
        const pmhnp = jobs.filter((j: { title: string }) => PMHNP_RE.test(j.title));
        return { totalJobs: jobs.length, pmhnpJobs: pmhnp.length, titles: pmhnp.slice(0, 3).map((j: { title: string }) => j.title) };
    } catch { return { totalJobs: 0, pmhnpJobs: 0, titles: [] }; }
}

async function testSmartRecruiters(slug: string): Promise<{ totalJobs: number; pmhnpJobs: number; titles: string[] }> {
    try {
        const res = await fetch(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`, {
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return { totalJobs: 0, pmhnpJobs: 0, titles: [] };
        const data = await res.json() as { content?: Array<{ name: string }> };
        const jobs = data.content || [];
        const pmhnp = jobs.filter((j: { name: string }) => PMHNP_RE.test(j.name));
        return { totalJobs: jobs.length, pmhnpJobs: pmhnp.length, titles: pmhnp.slice(0, 3).map((j: { name: string }) => j.name) };
    } catch { return { totalJobs: 0, pmhnpJobs: 0, titles: [] }; }
}

async function testBambooHR(slug: string): Promise<{ totalJobs: number; pmhnpJobs: number; titles: string[] }> {
    try {
        const res = await fetch(`https://${slug}.bamboohr.com/careers/list`, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return { totalJobs: 0, pmhnpJobs: 0, titles: [] };
        const data = await res.json() as { result?: Array<{ jobOpeningName: string }> };
        const jobs = data.result || [];
        const pmhnp = jobs.filter((j: { jobOpeningName: string }) => PMHNP_RE.test(j.jobOpeningName));
        return { totalJobs: jobs.length, pmhnpJobs: pmhnp.length, titles: pmhnp.slice(0, 3).map((j: { jobOpeningName: string }) => j.jobOpeningName) };
    } catch { return { totalJobs: 0, pmhnpJobs: 0, titles: [] }; }
}

async function testBreezyHR(slug: string): Promise<{ totalJobs: number; pmhnpJobs: number; titles: string[] }> {
    try {
        // BreezyHR has a JSON API at company subdomain
        const res = await fetch(`https://${slug}.breezy.hr/json`, {
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return { totalJobs: 0, pmhnpJobs: 0, titles: [] };
        const jobs = await res.json() as Array<{ name: string }>;
        if (!Array.isArray(jobs)) return { totalJobs: 0, pmhnpJobs: 0, titles: [] };
        const pmhnp = jobs.filter((j: { name: string }) => PMHNP_RE.test(j.name));
        return { totalJobs: jobs.length, pmhnpJobs: pmhnp.length, titles: pmhnp.slice(0, 3).map((j: { name: string }) => j.name) };
    } catch { return { totalJobs: 0, pmhnpJobs: 0, titles: [] }; }
}

async function testRecruitee(slug: string): Promise<{ totalJobs: number; pmhnpJobs: number; titles: string[] }> {
    try {
        const res = await fetch(`https://${slug}.recruitee.com/api/offers`, {
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return { totalJobs: 0, pmhnpJobs: 0, titles: [] };
        const data = await res.json() as { offers?: Array<{ title: string }> };
        const jobs = data.offers || [];
        const pmhnp = jobs.filter((j: { title: string }) => PMHNP_RE.test(j.title));
        return { totalJobs: jobs.length, pmhnpJobs: pmhnp.length, titles: pmhnp.slice(0, 3).map((j: { title: string }) => j.title) };
    } catch { return { totalJobs: 0, pmhnpJobs: 0, titles: [] }; }
}

async function testWorkable(slug: string): Promise<{ totalJobs: number; pmhnpJobs: number; titles: string[] }> {
    try {
        const res = await fetch(`https://apply.workable.com/api/v3/accounts/${slug}/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: '', location: '', department: [], worktype: [], remote: [] }),
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return { totalJobs: 0, pmhnpJobs: 0, titles: [] };
        const data = await res.json() as { results?: Array<{ title: string }> };
        const jobs = data.results || [];
        const pmhnp = jobs.filter((j: { title: string }) => PMHNP_RE.test(j.title));
        return { totalJobs: jobs.length, pmhnpJobs: pmhnp.length, titles: pmhnp.slice(0, 3).map((j: { title: string }) => j.title) };
    } catch { return { totalJobs: 0, pmhnpJobs: 0, titles: [] }; }
}

async function testWorkday(slug: string, url: string): Promise<{ totalJobs: number; pmhnpJobs: number; titles: string[] }> {
    // Workday URLs have the format: https://{instance}.wd{N}.myworkdayjobs.com/{slug}/{siteName}
    // We try to extract and test with the search API
    try {
        const wdMatch = url.match(/https?:\/\/([^.]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:en-US\/)?([^/\s]+)/);
        if (!wdMatch) return { totalJobs: 0, pmhnpJobs: 0, titles: [] };
        const [, company, instance, site] = wdMatch;
        const apiUrl = `https://${company}.${instance}.myworkdayjobs.com/wday/cxs/${company}/${site}/jobs`;

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: 'psychiatric nurse practitioner' }),
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return { totalJobs: 0, pmhnpJobs: 0, titles: [] };
        const data = await res.json() as { total?: number; jobPostings?: Array<{ title: string }> };
        const total = data.total || 0;
        const jobs = data.jobPostings || [];
        const pmhnp = jobs.filter((j: { title: string }) => PMHNP_RE.test(j.title));
        return { totalJobs: total, pmhnpJobs: pmhnp.length, titles: pmhnp.slice(0, 3).map((j: { title: string }) => j.title) };
    } catch { return { totalJobs: 0, pmhnpJobs: 0, titles: [] }; }
}

async function testICIMS(slug: string, url: string): Promise<{ totalJobs: number; pmhnpJobs: number; titles: string[] }> {
    // iCIMS uses custom career sites — try to fetch the page and check if it loads
    try {
        const res = await fetch(url, {
            signal: AbortSignal.timeout(10000),
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        if (!res.ok) return { totalJobs: 0, pmhnpJobs: 0, titles: [] };
        // We can at least confirm the site is reachable
        return { totalJobs: -1, pmhnpJobs: -1, titles: ['(Custom site - accessible)'] };
    } catch { return { totalJobs: 0, pmhnpJobs: 0, titles: [] }; }
}

async function testFreshteam(slug: string, url: string): Promise<{ totalJobs: number; pmhnpJobs: number; titles: string[] }> {
    try {
        const res = await fetch(url, {
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return { totalJobs: 0, pmhnpJobs: 0, titles: [] };
        return { totalJobs: -1, pmhnpJobs: -1, titles: ['(Freshteam - accessible)'] };
    } catch { return { totalJobs: 0, pmhnpJobs: 0, titles: [] }; }
}

// ========================= MAIN TEST RUNNER =========================

async function testSlug(row: CsvRow): Promise<TestResult> {
    let result: { totalJobs: number; pmhnpJobs: number; titles: string[] } = { totalJobs: 0, pmhnpJobs: 0, titles: [] };

    const platform = row.platform.toLowerCase();

    if (platform === 'greenhouse') result = await testGreenhouse(row.slug);
    else if (platform === 'lever') result = await testLever(row.slug);
    else if (platform === 'ashby') result = await testAshby(row.slug);
    else if (platform === 'smartrecruiters') result = await testSmartRecruiters(row.slug);
    else if (platform === 'bamboohr') result = await testBambooHR(row.slug);
    else if (platform === 'breezyhr') result = await testBreezyHR(row.slug);
    else if (platform === 'recruitee') result = await testRecruitee(row.slug);
    else if (platform === 'workable') result = await testWorkable(row.slug);
    else if (platform === 'workday') result = await testWorkday(row.slug, row.url);
    else if (platform === 'icims') result = await testICIMS(row.slug, row.url);
    else if (platform === 'freshteam') result = await testFreshteam(row.slug, row.url);

    return {
        company: row.company || row.slug,
        slug: row.slug,
        platform: row.platform,
        sector: row.sector,
        source: row.source,
        status: result.totalJobs > 0 || result.totalJobs === -1 ? 'live' : 'dead',
        totalJobs: result.totalJobs,
        pmhnpJobs: result.pmhnpJobs,
        sampleTitles: result.titles,
    };
}

async function main() {
    console.log('='.repeat(80));
    console.log('  TESTING ALL 938 HEALTHCARE ATS SLUGS');
    console.log('='.repeat(80));

    // Parse CSV
    const allRows = parseCsv(CSV_PATH);
    console.log(`\nTotal CSV entries: ${allRows.length}`);

    // Filter for healthcare-relevant slugs
    const healthRows = allRows.filter(r =>
        HEALTH_RE.test(r.slug) || HEALTH_RE.test(r.sector || '') || HEALTH_RE.test(r.company || '')
    );
    console.log(`Healthcare-relevant entries: ${healthRows.length}`);

    // Group by platform
    const byPlatform = new Map<string, CsvRow[]>();
    for (const row of healthRows) {
        const platform = row.platform;
        if (!byPlatform.has(platform)) byPlatform.set(platform, []);
        byPlatform.get(platform)!.push(row);
    }

    console.log('\nPer platform:');
    for (const [platform, rows] of byPlatform) {
        console.log(`  ${platform.padEnd(18)} ${rows.length} slugs`);
    }

    // Test with concurrency (batch of 5 at a time per platform)
    const BATCH_SIZE = 5;
    const DELAY_MS = 300; // 300ms between batches
    const allResults: TestResult[] = [];
    let tested = 0;

    for (const [platform, rows] of byPlatform) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`  Testing ${platform} (${rows.length} slugs)`);
        console.log('='.repeat(60));

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(batch.map(r => testSlug(r)));
            allResults.push(...batchResults);
            tested += batch.length;

            // Print live results immediately
            for (const r of batchResults) {
                if (r.status === 'live') {
                    const pmhnpStr = r.pmhnpJobs > 0 ? ` 🎯 ${r.pmhnpJobs} PMHNP` : '';
                    console.log(`  ✅ ${r.slug.padEnd(35)} ${r.totalJobs.toString().padStart(5)} jobs${pmhnpStr}${r.sampleTitles.length > 0 ? ' — ' + r.sampleTitles[0] : ''}`);
                }
            }

            // Progress
            if ((i + BATCH_SIZE) % 50 === 0 || i + BATCH_SIZE >= rows.length) {
                const live = allResults.filter(r => r.platform === platform && r.status === 'live').length;
                const dead = allResults.filter(r => r.platform === platform && r.status === 'dead').length;
                process.stdout.write(`  [${platform}] Progress: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} — Live: ${live}, Dead: ${dead}\n`);
            }

            await sleep(DELAY_MS);
        }
    }

    // ========================= FINAL REPORT =========================
    console.log('\n\n' + '='.repeat(80));
    console.log('  FINAL RESULTS');
    console.log('='.repeat(80));

    const liveResults = allResults.filter(r => r.status === 'live');
    const pmhnpResults = allResults.filter(r => r.pmhnpJobs > 0);

    console.log(`\nTotal tested:    ${allResults.length}`);
    console.log(`Live sites:      ${liveResults.length}`);
    console.log(`Dead/error:      ${allResults.length - liveResults.length}`);
    console.log(`PMHNP matches:   ${pmhnpResults.length}`);

    console.log('\n--- LIVE SITES BY PLATFORM ---');
    for (const [platform] of byPlatform) {
        const platResults = allResults.filter(r => r.platform === platform);
        const live = platResults.filter(r => r.status === 'live');
        const pmhnp = platResults.filter(r => r.pmhnpJobs > 0);
        console.log(`  ${platform.padEnd(18)} Live: ${live.length.toString().padStart(4)} / ${platResults.length.toString().padStart(4)}  PMHNP: ${pmhnp.length}`);
    }

    console.log('\n--- 🎯 PMHNP JOB MATCHES (most valuable) ---');
    const sortedPmhnp = pmhnpResults.sort((a, b) => b.pmhnpJobs - a.pmhnpJobs);
    for (const r of sortedPmhnp) {
        console.log(`  ${r.platform.padEnd(16)} ${r.slug.padEnd(35)} ${r.pmhnpJobs.toString().padStart(3)} PMHNP / ${r.totalJobs.toString().padStart(5)} total — ${r.sampleTitles.join('; ')}`);
    }

    console.log('\n--- 📊 TOP LIVE SITES BY TOTAL JOBS (top 50) ---');
    const sortedLive = liveResults.filter(r => r.totalJobs > 0).sort((a, b) => b.totalJobs - a.totalJobs).slice(0, 50);
    for (const r of sortedLive) {
        console.log(`  ${r.platform.padEnd(16)} ${r.slug.padEnd(35)} ${r.totalJobs.toString().padStart(6)} jobs  ${r.sector || ''}`);
    }

    // Write results to JSON for further analysis
    const outputPath = path.join(__dirname, '..', 'scripts', 'ats-test-results.json');
    fs.writeFileSync(outputPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        totalTested: allResults.length,
        totalLive: liveResults.length,
        totalPmhnp: pmhnpResults.length,
        results: allResults,
    }, null, 2));
    console.log(`\n✅ Full results saved to ${outputPath}`);

    // Also write a summary CSV
    const csvOut = path.join(__dirname, '..', 'scripts', 'ats-test-results.csv');
    const csvLines = ['Platform,Slug,Company,Sector,Source,Status,TotalJobs,PMHNPJobs,SampleTitles'];
    for (const r of allResults) {
        csvLines.push(`${r.platform},${r.slug},"${r.company}","${r.sector}",${r.source},${r.status},${r.totalJobs},${r.pmhnpJobs},"${r.sampleTitles.join('; ')}"`);
    }
    fs.writeFileSync(csvOut, csvLines.join('\n'));
    console.log(`✅ CSV results saved to ${csvOut}`);
}

main().catch(console.error);
