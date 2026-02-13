import pg from 'pg';
import { isRelevantJob } from '../lib/utils/job-filter';
const { Pool } = pg;

const PROD_URL = 'REDACTED_USE_ENV_VAR';
const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

const ALREADY_ADDED = new Set([
    'sondermind', 'headway', 'modernhealth', 'mantrahealth', 'cerebral', 'twochairs',
    'talkspace', 'ayahealthcare', 'amwell', 'octave', 'growtherapy',
    'blueskytelepsych', 'bicyclehealth', 'signifyhealth', 'valerahealth',
    'charliehealth', 'blackbirdhealth', 'ophelia',
    'springhealth66', 'omadahealth', 'brave',
    'betterhelp', 'firsthand', 'compasspathways',
    'alma', 'cortica', 'galileo', 'amaehealth', 'pelago',
    'bouldercare', 'daybreakhealth', 'parallellearning', 'legion',
    'array', 'neuroflow', 'forgehealth', 'iris',
    'lifestance', 'talkiatry', 'includedhealth', 'lyrahealth', 'carbonhealth',
    'prosper', 'bighealth', 'genesis', 'sesame',
]);

function companyToSlugs(name: string): string[] {
    const base = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const slugs: string[] = [];
    const nospaces = base.replace(/\s+/g, '');
    slugs.push(nospaces);
    const words = base.split(/\s+/);
    if (words.length > 1) {
        slugs.push(words[0]);
        slugs.push(words.join('-'));
        const stopWords = ['health', 'healthcare', 'medical', 'inc', 'llc', 'corp', 'group', 'services', 'care', 'therapeutics', 'therapy', 'behavioral', 'solutions', 'management', 'staffing', 'consulting', 'associates', 'partners', 'network', 'systems', 'of', 'the', 'and', 'co', 'company'];
        const filtered = words.filter(w => !stopWords.includes(w));
        if (filtered.length > 0 && filtered.join('') !== nospaces) slugs.push(filtered.join(''));
    }
    return [...new Set(slugs)].filter(s => s.length > 2 && !ALREADY_ADDED.has(s));
}

// Run N promises at a time
async function parallelLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
    const results: T[] = [];
    let idx = 0;
    async function worker() {
        while (idx < tasks.length) {
            const i = idx++;
            results[i] = await tasks[i]();
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
    return results;
}

type Hit = { slug: string; company: string; total: number; pmhnp: number; recent: number };

async function main() {
    console.log('Connecting to PROD database...');
    const pool = new Pool({ connectionString: PROD_URL, ssl: { rejectUnauthorized: false } });
    const result = await pool.query('SELECT employer, COUNT(*)::int as cnt FROM jobs WHERE employer IS NOT NULL GROUP BY employer ORDER BY cnt DESC');
    await pool.end();

    console.log(`📊 ${result.rows.length} unique employers in PROD DB`);

    const allSlugs = new Set<string>();
    const slugToCompany = new Map<string, string>();
    for (const row of result.rows) {
        const name = row.employer as string;
        for (const slug of companyToSlugs(name)) {
            allSlugs.add(slug);
            slugToCompany.set(slug, name);
        }
    }
    const slugList = [...allSlugs];
    console.log(`🔍 ${slugList.length} slugs to test (10 parallel)\n`);

    const ghHits: Hit[] = [];
    const leverHits: Hit[] = [];
    let done = 0;

    const tasks = slugList.map(slug => async () => {
        const company = slugToCompany.get(slug) || slug;

        // Greenhouse
        try {
            const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
            if (r.ok) {
                const data = await r.json();
                const jobs = data.jobs || [];
                if (jobs.length > 0) {
                    const pmhnp = jobs.filter((j: any) => isRelevantJob(j.title || '', j.content || ''));
                    const recent = pmhnp.filter((j: any) => new Date(j.updated_at) >= THIRTY_DAYS_AGO);
                    ghHits.push({ slug, company, total: jobs.length, pmhnp: pmhnp.length, recent: recent.length });
                    if (pmhnp.length > 0) console.log(`🟢 GH  ${slug} (${company}): ${jobs.length} total, ${pmhnp.length} PMHNP, ${recent.length} recent`);
                }
            }
        } catch { }

        // Lever
        try {
            const r = await fetch(`https://api.lever.co/v0/postings/${slug}`);
            if (r.ok) {
                const postings = await r.json();
                if (Array.isArray(postings) && postings.length > 0) {
                    const pmhnp = postings.filter((p: any) => {
                        const desc = [p.descriptionPlain, p.description, ...(p.lists?.map((l: any) => l.content) || [])].join(' ');
                        return isRelevantJob(p.text || '', desc);
                    });
                    const recent = pmhnp.filter((p: any) => new Date(p.createdAt) >= THIRTY_DAYS_AGO);
                    leverHits.push({ slug, company, total: postings.length, pmhnp: pmhnp.length, recent: recent.length });
                    if (pmhnp.length > 0) console.log(`🟢 LEV ${slug} (${company}): ${postings.length} total, ${pmhnp.length} PMHNP, ${recent.length} recent`);
                }
            }
        } catch { }

        done++;
        if (done % 500 === 0) console.log(`... ${done}/${slugList.length}`);
    });

    await parallelLimit(tasks, 10);

    console.log('\n════════════════════════════════════');
    console.log(' RESULTS FROM PROD DB MINING');
    console.log('════════════════════════════════════\n');

    console.log(`GREENHOUSE — HAS PMHNP JOBS (${ghHits.filter(h => h.pmhnp > 0).length}):`);
    ghHits.filter(h => h.pmhnp > 0).sort((a, b) => b.pmhnp - a.pmhnp)
        .forEach(h => console.log(`  ✅ ${h.slug} (${h.company}): ${h.pmhnp} PMHNP (${h.recent} recent)`));

    console.log(`\nGREENHOUSE — MONITORING top 50 (${ghHits.filter(h => h.pmhnp === 0).length} total):`);
    ghHits.filter(h => h.pmhnp === 0).sort((a, b) => b.total - a.total).slice(0, 50)
        .forEach(h => console.log(`  ⬜ ${h.slug} (${h.company}): ${h.total} total`));

    console.log(`\nLEVER — HAS PMHNP JOBS (${leverHits.filter(h => h.pmhnp > 0).length}):`);
    leverHits.filter(h => h.pmhnp > 0).sort((a, b) => b.pmhnp - a.pmhnp)
        .forEach(h => console.log(`  ✅ ${h.slug} (${h.company}): ${h.pmhnp} PMHNP (${h.recent} recent)`));

    console.log(`\nLEVER — MONITORING top 50 (${leverHits.filter(h => h.pmhnp === 0).length} total):`);
    leverHits.filter(h => h.pmhnp === 0).sort((a, b) => b.total - a.total).slice(0, 50)
        .forEach(h => console.log(`  ⬜ ${h.slug} (${h.company}): ${h.total} total`));

    const totalNew = ghHits.reduce((s, h) => s + h.pmhnp, 0) + leverHits.reduce((s, h) => s + h.pmhnp, 0);
    console.log(`\n📈 New PMHNP jobs found: ${totalNew}`);
    console.log(`📊 Slugs tested: ${slugList.length}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
