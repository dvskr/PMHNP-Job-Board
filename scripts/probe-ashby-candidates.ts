/**
 * Verify the Ashby slug candidates surfaced by
 * scripts/discover-ats-tenants-from-db.ts before adding to
 * lib/aggregators/tenants/ashby.ts. Some slugs in the DB are URL-encoded
 * (e.g. "fort%20health") so they need normalization first.
 *
 * Read-only. No DB access.
 */

import { isRelevantJob } from '@/lib/utils/job-filter';

const CANDIDATES: ReadonlyArray<{ raw: string; name: string }> = [
    { raw: 'sondermind', name: 'SonderMind' },
    { raw: 'talkiatry', name: 'Talkiatry' },
    { raw: 'reklamehealth', name: 'Reklame Health' },
    { raw: 'legionhealth', name: 'Legion Health' },
    { raw: 'fort%20health', name: 'Fort Health' },
    { raw: 'fort-health', name: 'Fort Health' },
    { raw: 'forthealth', name: 'Fort Health' },
    { raw: 'claritypediatrics', name: 'Clarity Pediatrics' },
    { raw: 'blossom-health', name: 'Blossom Health' },
    { raw: 'array-behavioral-care', name: 'Array Behavioral Care' },
    { raw: 'salma-health', name: 'Salma Health' },
    { raw: 'hellobrightline', name: 'Brightline' },
    { raw: 'third-space-therapy', name: 'Third Space Therapy' },
    { raw: 'sunflower-sober', name: 'Sunflower Sober' },
];

interface AshbyJob {
    id: string;
    title: string;
    isRemote?: boolean;
}

interface AshbyResponse {
    apiVersion: string;
    jobs: AshbyJob[];
}

async function probe(rawSlug: string): Promise<{
    slug: string;
    status: number;
    totalJobs: number;
    pmhnp: number;
    sampleTitles: string[];
}> {
    // Normalize: URL-decode then drop spaces.
    const decoded = decodeURIComponent(rawSlug).replace(/\s+/g, '-').toLowerCase();
    const url = `https://api.ashbyhq.com/posting-api/job-board/${decoded}?includeCompensation=true`;
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(t);
        if (!res.ok) return { slug: decoded, status: res.status, totalJobs: 0, pmhnp: 0, sampleTitles: [] };
        const data = (await res.json()) as AshbyResponse;
        const jobs = data.jobs ?? [];
        const pmhnpTitles: string[] = [];
        for (const j of jobs) {
            if (isRelevantJob(j.title ?? '', '')) pmhnpTitles.push(j.title);
        }
        return {
            slug: decoded,
            status: res.status,
            totalJobs: jobs.length,
            pmhnp: pmhnpTitles.length,
            sampleTitles: pmhnpTitles.slice(0, 3),
        };
    } catch {
        return { slug: decoded, status: 0, totalJobs: 0, pmhnp: 0, sampleTitles: [] };
    }
}

async function main(): Promise<void> {
    console.log(`Verifying ${CANDIDATES.length} Ashby candidates live...\n`);
    const results: Array<{ raw: string; name: string; slug: string; status: number; totalJobs: number; pmhnp: number; sampleTitles: string[] }> = [];
    for (const c of CANDIDATES) {
        const r = await probe(c.raw);
        results.push({ ...c, ...r });
        await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log('raw                              normalized-slug                   name                     HTTP  total  pmhnp');
    console.log('─'.repeat(125));
    for (const r of results) {
        const marker = r.status === 200 && r.pmhnp > 0 ? '★' : r.status === 200 ? '·' : ' ';
        console.log(
            `${marker} ${r.raw.padEnd(30)} ${r.slug.padEnd(33)} ${r.name.padEnd(24)} ${String(r.status).padStart(4)} ${String(r.totalJobs).padStart(6)} ${String(r.pmhnp).padStart(6)}`,
        );
    }

    console.log('\n=== READY TO ADD ===');
    const live = results.filter((r) => r.status === 200 && r.pmhnp > 0);
    for (const r of live) {
        console.log(`    { slug: '${r.slug}', name: '${r.name}' },  // ${r.pmhnp}/${r.totalJobs} pmhnp/total live`);
        for (const t of r.sampleTitles) {
            console.log(`      // - ${t}`);
        }
    }

    const liveNoPmhnp = results.filter((r) => r.status === 200 && r.pmhnp === 0);
    if (liveNoPmhnp.length > 0) {
        console.log('\n=== LIVE BUT NO PMHNP NOW (monitor candidates) ===');
        for (const r of liveNoPmhnp) {
            console.log(`  ${r.slug}  total=${r.totalJobs}`);
        }
    }
}

main().catch((err) => {
    console.error('Probe crashed:', err);
    process.exit(1);
});
