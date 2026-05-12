/**
 * Verify Lever slug candidates from the prod DB scan. Some candidates
 * had `.com`/`.health` suffixes which don't match real Lever slugs —
 * the discovery script may have grabbed a path segment that's not the
 * org slug. This probe normalizes variants and confirms live status.
 *
 * Read-only.
 */

import { isRelevantJob } from '@/lib/utils/job-filter';

interface CandidateGroup {
    name: string;
    variants: string[];
}

// Each group is one logical employer with multiple slug guesses.
const CANDIDATES: ReadonlyArray<CandidateGroup> = [
    {
        name: 'Headlight',
        variants: ['headlight.health', 'headlighthealth', 'headlight-health', 'headlight'],
    },
    {
        name: 'Willow Health',
        variants: ['willowhealth.com', 'willowhealth', 'willow-health', 'willow'],
    },
    {
        name: 'Ultra Health',
        variants: ['ultrahealthproviders', 'ultra-health', 'ultrahealth'],
    },
];

interface LeverPosting {
    id: string;
    text: string;
    hostedUrl?: string;
}

async function probe(slug: string): Promise<{
    slug: string;
    status: number;
    totalJobs: number;
    pmhnp: number;
    sampleTitles: string[];
}> {
    const url = `https://api.lever.co/v0/postings/${slug}?mode=json&limit=200`;
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(t);
        if (!res.ok) return { slug, status: res.status, totalJobs: 0, pmhnp: 0, sampleTitles: [] };
        const data = (await res.json()) as LeverPosting[];
        const titles = data.map((j) => j.text || '');
        const pmhnpTitles = titles.filter((t) => isRelevantJob(t, ''));
        return {
            slug,
            status: res.status,
            totalJobs: data.length,
            pmhnp: pmhnpTitles.length,
            sampleTitles: pmhnpTitles.slice(0, 3),
        };
    } catch {
        return { slug, status: 0, totalJobs: 0, pmhnp: 0, sampleTitles: [] };
    }
}

async function main(): Promise<void> {
    console.log(`Probing ${CANDIDATES.reduce((a, c) => a + c.variants.length, 0)} Lever slug variants...\n`);
    for (const group of CANDIDATES) {
        console.log(`\n── ${group.name} ──`);
        for (const v of group.variants) {
            const r = await probe(v);
            const marker = r.status === 200 ? '★' : ' ';
            console.log(`${marker} ${v.padEnd(28)}  HTTP ${String(r.status).padStart(3)}  total=${String(r.totalJobs).padStart(3)}  pmhnp=${String(r.pmhnp).padStart(2)}`);
            if (r.status === 200 && r.pmhnp > 0) {
                for (const t of r.sampleTitles) console.log(`      ${t}`);
            }
            await new Promise((r) => setTimeout(r, 200));
        }
    }
}

main().catch((err) => {
    console.error('Probe crashed:', err);
    process.exit(1);
});
