/**
 * Probe a list of candidate Ashby org slugs to find:
 *   - which slugs actually have a live Ashby job board
 *   - how many total jobs each board has
 *   - how many of those titles look PMHNP-relevant
 *
 * Endpoint:
 *   https://api.ashbyhq.com/posting-api/job-board/{orgSlug}?includeCompensation=true
 *
 * Public, unauthenticated. Used as a one-shot discovery tool before
 * adding slugs to lib/aggregators/tenants/ashby.ts. Read-only — never
 * touches the DB.
 *
 * Run with:
 *   npx tsx scripts/discover-ashby-tenants.ts
 *
 * Add a slug to CANDIDATES below to test it. Output is a table you can
 * eyeball + copy the keepers into the tenant file.
 */

import { isRelevantJob } from '@/lib/utils/job-filter';

// Curated guesses — orgs known to operate in mental-health / nursing /
// telehealth that *might* use Ashby. Probe results determine which
// actually do.
const CANDIDATES: ReadonlyArray<{ slug: string; name: string }> = [
    { slug: 'brightside', name: 'Brightside Health' },
    { slug: 'brightsidehealth', name: 'Brightside Health (alt)' },
    { slug: 'equip', name: 'Equip Health' },
    { slug: 'equiphealth', name: 'Equip Health (alt)' },
    { slug: 'rula', name: 'Rula Health' },
    { slug: 'rulahealth', name: 'Rula Health (alt)' },
    { slug: 'path', name: 'Path Mental Health' },
    { slug: 'pathccm', name: 'Path CCM' },
    { slug: 'pathmentalhealth', name: 'Path Mental Health (alt)' },
    { slug: 'alma', name: 'Alma' },
    { slug: 'helloalma', name: 'Alma (alt)' },
    { slug: 'spring', name: 'Spring Health' },
    { slug: 'springhealth', name: 'Spring Health (alt)' },
    { slug: 'octave', name: 'Octave' },
    { slug: 'findoctave', name: 'Octave (alt)' },
    { slug: 'two-chairs', name: 'Two Chairs' },
    { slug: 'twochairs', name: 'Two Chairs (alt)' },
    { slug: 'mindful', name: 'Mindful Care' },
    { slug: 'mindfulcare', name: 'Mindful Care (alt)' },
    { slug: 'talkiatry', name: 'Talkiatry' },
    { slug: 'charliehealth', name: 'Charlie Health' },
    { slug: 'valera', name: 'Valera Health' },
    { slug: 'valerahealth', name: 'Valera Health (alt)' },
    { slug: 'cerebral', name: 'Cerebral' },
    { slug: 'bravehealth', name: 'Brave Health' },
    { slug: 'firsthand', name: 'Firsthand' },
    { slug: 'tia', name: 'Tia' },
    { slug: 'asktia', name: 'Tia (alt)' },
    { slug: 'midi', name: 'Midi Health' },
    { slug: 'joinmidi', name: 'Midi (alt)' },
    { slug: 'parsley', name: 'Parsley Health' },
    { slug: 'parsleyhealth', name: 'Parsley Health (alt)' },
    { slug: 'lyra', name: 'Lyra Health' },
    { slug: 'lyrahealth', name: 'Lyra Health (alt)' },
    { slug: 'modernhealth', name: 'Modern Health' },
    { slug: 'big-health', name: 'Big Health' },
    { slug: 'bighealth', name: 'Big Health (alt)' },
    { slug: 'array', name: 'Array Behavioral Care' },
    { slug: 'arraybc', name: 'Array (alt)' },
    { slug: 'osmind', name: 'Osmind' },
    { slug: 'monogram', name: 'Monogram Health' },
    { slug: 'monogramhealth', name: 'Monogram Health (alt)' },
    { slug: 'turquoise', name: 'Turquoise Health' },
    { slug: 'sondermind', name: 'SonderMind' },
    { slug: 'sword', name: 'Sword Health' },
    { slug: 'swordhealth', name: 'Sword Health (alt)' },
    { slug: 'hims', name: 'Hims' },
    { slug: 'forhims', name: 'Hims (alt)' },
    { slug: 'kindbody', name: 'Kindbody' },
    { slug: 'tempushealth', name: 'Tempus' },
    { slug: 'forwardhealth', name: 'Forward Health' },
    { slug: 'goforward', name: 'Forward (alt)' },
    { slug: 'mantra', name: 'Mantra Health' },
    { slug: 'mantrahealth', name: 'Mantra Health (alt)' },
    { slug: 'koalahealth', name: 'Koala Health' },
    { slug: 'lifestance', name: 'LifeStance Health' },
    { slug: 'numan', name: 'Numan' },
    { slug: 'rosewell', name: 'Rosewell' },
    { slug: 'thirty-madison', name: 'Thirty Madison' },
    { slug: 'thirtymadison', name: 'Thirty Madison (alt)' },
    { slug: 'reside', name: 'Reside Health' },
    { slug: 'reside-health', name: 'Reside Health (alt)' },
    { slug: 'transcarent', name: 'Transcarent' },
    { slug: 'wisp', name: 'Wisp' },
    { slug: 'hellowisp', name: 'Wisp (alt)' },
    { slug: 'oui-therapeutics', name: 'Oui Therapeutics' },
    { slug: 'prosper', name: 'Prosper Health' },
    { slug: 'prosperhealth', name: 'Prosper Health (alt)' },
];

interface AshbyAddress {
    postalAddress?: {
        addressRegion?: string;
        addressCountry?: string;
        addressLocality?: string;
    };
}

interface AshbyJob {
    id: string;
    title: string;
    departmentName?: string;
    team?: string;
    employmentType?: string;
    location?: string;
    publishedDate?: string;
    isRemote?: boolean;
    address?: AshbyAddress;
    descriptionPlain?: string;
    jobUrl?: string;
    applyUrl?: string;
}

interface AshbyResponse {
    apiVersion: string;
    jobs: AshbyJob[];
}

async function probe(slug: string): Promise<{
    slug: string;
    status: number;
    totalJobs: number;
    pmhnpJobs: number;
    pmhnpTitles: string[];
}> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) {
            return { slug, status: res.status, totalJobs: 0, pmhnpJobs: 0, pmhnpTitles: [] };
        }

        const data = (await res.json()) as AshbyResponse;
        const jobs = data.jobs ?? [];
        const pmhnpTitles: string[] = [];
        for (const j of jobs) {
            if (isRelevantJob(j.title ?? '', j.descriptionPlain ?? '')) {
                pmhnpTitles.push(j.title);
            }
        }
        return {
            slug,
            status: res.status,
            totalJobs: jobs.length,
            pmhnpJobs: pmhnpTitles.length,
            pmhnpTitles: pmhnpTitles.slice(0, 5),
        };
    } catch {
        return { slug, status: 0, totalJobs: 0, pmhnpJobs: 0, pmhnpTitles: [] };
    }
}

async function main(): Promise<void> {
    console.log(`Probing ${CANDIDATES.length} Ashby slug candidates...\n`);

    type Row = {
        slug: string;
        name: string;
        status: number;
        totalJobs: number;
        pmhnpJobs: number;
        pmhnpTitles: string[];
    };

    const results: Row[] = [];
    const BATCH = 5;
    for (let i = 0; i < CANDIDATES.length; i += BATCH) {
        const batch = CANDIDATES.slice(i, i + BATCH);
        const settled = await Promise.allSettled(batch.map((c) => probe(c.slug)));
        for (let j = 0; j < settled.length; j++) {
            const s = settled[j];
            const c = batch[j];
            if (s.status === 'fulfilled') {
                results.push({ ...c, ...s.value });
            }
        }
        // Small gap between batches to avoid hammering the public API.
        if (i + BATCH < CANDIDATES.length) await new Promise((r) => setTimeout(r, 300));
    }

    // Sort: live boards with PMHNP jobs first, then live boards, then dead.
    results.sort((a, b) => {
        if (b.pmhnpJobs !== a.pmhnpJobs) return b.pmhnpJobs - a.pmhnpJobs;
        if (b.totalJobs !== a.totalJobs) return b.totalJobs - a.totalJobs;
        return a.slug.localeCompare(b.slug);
    });

    console.log('slug                          name                          HTTP  total  pmhnp');
    console.log('─'.repeat(95));
    for (const r of results) {
        const marker = r.status === 200 && r.pmhnpJobs > 0 ? '★' : r.status === 200 ? '·' : ' ';
        console.log(
            `${marker} ${r.slug.padEnd(28)} ${r.name.padEnd(30)} ${String(r.status).padStart(4)} ${String(r.totalJobs).padStart(6)} ${String(r.pmhnpJobs).padStart(6)}`,
        );
    }

    console.log();
    const live = results.filter((r) => r.status === 200);
    const withPmhnp = live.filter((r) => r.pmhnpJobs > 0);
    console.log(`Live Ashby boards: ${live.length} of ${results.length} probed`);
    console.log(`Boards with ≥1 PMHNP-relevant title: ${withPmhnp.length}`);

    if (withPmhnp.length > 0) {
        console.log('\n=== KEEPERS (have PMHNP jobs) ===');
        for (const r of withPmhnp) {
            console.log(`\n  { slug: '${r.slug}', name: '${r.name.replace(" (alt)", "")}' },  // ${r.pmhnpJobs}/${r.totalJobs} pmhnp/total`);
            for (const t of r.pmhnpTitles) {
                console.log(`      - ${t}`);
            }
        }
    }

    const liveNoPmhnp = live.filter((r) => r.pmhnpJobs === 0);
    if (liveNoPmhnp.length > 0) {
        console.log('\n=== LIVE BUT NO PMHNP RIGHT NOW (worth monitoring) ===');
        for (const r of liveNoPmhnp) {
            console.log(`  ${r.slug}  (${r.totalJobs} total jobs)`);
        }
    }
}

main().catch((err) => {
    console.error('Discovery crashed:', err);
    process.exit(1);
});
