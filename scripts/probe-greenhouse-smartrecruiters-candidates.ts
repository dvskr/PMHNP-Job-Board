/**
 * Verify Greenhouse + SmartRecruiters slug candidates from prod DB scan.
 * Filters out obvious garbage (slugs with parens / special chars / runs
 * of digits in the middle — almost always URL-parse artifacts).
 *
 * Read-only.
 */

import { isRelevantJob } from '@/lib/utils/job-filter';

// --- GREENHOUSE candidates ---
// Garbled slugs from discovery (e.g. '1pyra)mid_health&care',
// 'erc8585757pathlight53t353', 'the858emily123program') were dropped —
// these are URL-parse artifacts, not real Greenhouse slugs.
const GREENHOUSE_CANDIDATES: ReadonlyArray<{ slug: string; name: string; expectedPmhnp: number }> = [
    { slug: 'riviamind1', name: 'Rivia Mind', expectedPmhnp: 110 },
    { slug: 'joinaffect', name: 'Affect', expectedPmhnp: 99 },
    { slug: 'mind247', name: 'MIND 24-7', expectedPmhnp: 18 },
    { slug: 'familywell', name: 'FamilyWell', expectedPmhnp: 15 },
    { slug: 'telemed2u', name: 'TeleMed2U', expectedPmhnp: 14 },
    { slug: 'onepeakmedical', name: 'OnePeak Medical', expectedPmhnp: 3 },
    { slug: 'eliotcommunityhumanservices', name: 'Eliot Community Human Services', expectedPmhnp: 1 },
    { slug: 'psychiatricproviders', name: 'WellPower Psychiatric Providers', expectedPmhnp: 1 },
];

// --- SMARTRECRUITERS candidates ---
const SR_CANDIDATES: ReadonlyArray<{ slug: string; name: string; expectedPmhnp: number }> = [
    { slug: 'covista', name: 'Covista', expectedPmhnp: 35 },
    { slug: 'northwesternmedicine', name: 'Northwestern Memorial Healthcare', expectedPmhnp: 31 },
    { slug: 'ahrcnyc1', name: 'AHRC NYC', expectedPmhnp: 24 },
    { slug: 'smitharnoldpartners', name: 'Smith Arnold Partners', expectedPmhnp: 2 },
    { slug: 'vericare', name: 'Vericare', expectedPmhnp: 1 },
];

interface GreenhouseJobBoardResponse {
    jobs?: Array<{ id: number; title: string; updated_at?: string }>;
    meta?: { total: number };
}

interface SrPostingsResponse {
    content?: Array<{ id: string; name: string }>;
    totalFound?: number;
}

async function probeGreenhouse(slug: string): Promise<{ status: number; total: number; pmhnp: number; sampleTitles: string[] }> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(t);
        if (!res.ok) return { status: res.status, total: 0, pmhnp: 0, sampleTitles: [] };
        const data = (await res.json()) as GreenhouseJobBoardResponse;
        const jobs = data.jobs ?? [];
        const pmhnpTitles = jobs.filter((j) => isRelevantJob(j.title, '')).map((j) => j.title);
        return { status: res.status, total: jobs.length, pmhnp: pmhnpTitles.length, sampleTitles: pmhnpTitles.slice(0, 3) };
    } catch {
        return { status: 0, total: 0, pmhnp: 0, sampleTitles: [] };
    }
}

async function probeSmartRecruiters(slug: string): Promise<{ status: number; total: number; pmhnp: number; sampleTitles: string[] }> {
    const url = `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100&offset=0`;
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(t);
        if (!res.ok) return { status: res.status, total: 0, pmhnp: 0, sampleTitles: [] };
        const data = (await res.json()) as SrPostingsResponse;
        const postings = data.content ?? [];
        const pmhnpTitles = postings.filter((p) => isRelevantJob(p.name, '')).map((p) => p.name);
        return { status: res.status, total: data.totalFound ?? postings.length, pmhnp: pmhnpTitles.length, sampleTitles: pmhnpTitles.slice(0, 3) };
    } catch {
        return { status: 0, total: 0, pmhnp: 0, sampleTitles: [] };
    }
}

async function main(): Promise<void> {
    console.log('=== GREENHOUSE ===');
    console.log('slug                              name                              HTTP  total  pmhnp   (expected historical)');
    console.log('─'.repeat(115));
    for (const c of GREENHOUSE_CANDIDATES) {
        const r = await probeGreenhouse(c.slug);
        const marker = r.status === 200 && r.pmhnp > 0 ? '★' : r.status === 200 ? '·' : ' ';
        console.log(`${marker} ${c.slug.padEnd(32)} ${c.name.padEnd(33)} ${String(r.status).padStart(4)} ${String(r.total).padStart(6)} ${String(r.pmhnp).padStart(6)}   (${c.expectedPmhnp})`);
        for (const t of r.sampleTitles) console.log(`    ${t}`);
        await new Promise((r) => setTimeout(r, 200));
    }

    console.log('\n=== SMARTRECRUITERS ===');
    console.log('slug                              name                              HTTP  total  pmhnp   (expected historical)');
    console.log('─'.repeat(115));
    for (const c of SR_CANDIDATES) {
        const r = await probeSmartRecruiters(c.slug);
        const marker = r.status === 200 && r.pmhnp > 0 ? '★' : r.status === 200 ? '·' : ' ';
        console.log(`${marker} ${c.slug.padEnd(32)} ${c.name.padEnd(33)} ${String(r.status).padStart(4)} ${String(r.total).padStart(6)} ${String(r.pmhnp).padStart(6)}   (${c.expectedPmhnp})`);
        for (const t of r.sampleTitles) console.log(`    ${t}`);
        await new Promise((r) => setTimeout(r, 200));
    }
}

main().catch((err) => {
    console.error('Probe crashed:', err);
    process.exit(1);
});
