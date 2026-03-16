/**
 * Audit all source slugs — identify dead (404/422) endpoints for removal.
 * Runs a quick HEAD/GET check against each company's API endpoint.
 */

import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.prod' });

// ============ LEVER ============
const LEVER_COMPANIES = [
    'lifestance', 'talkiatry', 'includedhealth', 'lyrahealth', 'carbonhealth',
    'prosper', 'bighealth', 'genesis', 'sesame', 'mindful', 'athenapsych',
    'seven-starling', 'beckley-clinical', 'synapticure', 'arundellodge',
    'ro', 'advocate', 'ucsf', 'lunaphysicaltherapy', 'guidestareldercare',
    'next-health', 'ekohealth', 'heartbeathealth', 'swordhealth',
    'aledade', 'clarifyhealth', 'koalahealth', 'nimblerx', 'pointclickcare',
    'salvohealth', 'vivo-care', 'wepclinical', 'zushealth',
    'cerebral', 'donehealth', 'mindbloom', 'brightside', 'alma', 'headway',
    'growtherapy', 'rula', 'springhealth', 'modernhealth', 'ginger', 'pathccm',
    'valera', 'regroup', 'teladochealth',
];

async function checkLever(slug: string): Promise<boolean> {
    try {
        const res = await fetch(`https://api.lever.co/v0/postings/${slug}?limit=1`, { signal: AbortSignal.timeout(10000) });
        return res.ok;
    } catch { return false; }
}

// ============ GREENHOUSE ============
async function checkGreenhouse(slug: string): Promise<boolean> {
    try {
        const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?per_page=1`, { signal: AbortSignal.timeout(10000) });
        return res.ok;
    } catch { return false; }
}

// ============ WORKDAY ============
// Workday uses structured URLs — we need the full config
interface WorkdayCompany {
    name: string;
    slug: string;
    tenant: string;
}

async function checkWorkday(company: WorkdayCompany): Promise<boolean> {
    try {
        const url = `https://${company.slug}.wd5.myworkdayjobs.com/wday/cxs/${company.slug}/${company.tenant}/jobs`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 1, offset: 0, searchText: 'test' }),
            signal: AbortSignal.timeout(10000),
        });
        return res.ok;
    } catch { return false; }
}

async function auditSource(name: string, slugs: string[], checker: (slug: string) => Promise<boolean>) {
    const dead: string[] = [];
    const alive: string[] = [];

    // Check 10 at a time
    for (let i = 0; i < slugs.length; i += 10) {
        const batch = slugs.slice(i, i + 10);
        const results = await Promise.all(batch.map(async slug => {
            const ok = await checker(slug);
            return { slug, ok };
        }));
        for (const r of results) {
            if (r.ok) alive.push(r.slug);
            else dead.push(r.slug);
        }
        process.stdout.write(`  [${name}] Checked ${Math.min(i + 10, slugs.length)}/${slugs.length}...\r`);
    }

    console.log(`\n  [${name}] ${alive.length} alive, ${dead.length} dead`);
    if (dead.length > 0) {
        console.log(`  Dead slugs: ${dead.join(', ')}`);
    }
    return { alive, dead };
}

async function run() {
    console.log('=== Dead Slug Audit ===\n');

    // 1. Lever
    console.log('--- LEVER ---');
    const leverResult = await auditSource('Lever', LEVER_COMPANIES, checkLever);

    // 2. Greenhouse — read the full company list from the file
    console.log('\n--- GREENHOUSE ---');
    // Import dynamically to get the company list
    const ghModule = await import('../lib/aggregators/greenhouse');
    // The companies are exported internally, but we can read them from the file
    // Just do a quick API check on the first 100 that are most likely healthcare
    const ghSlugs: string[] = [];
    const ghFileContent = require('fs').readFileSync('lib/aggregators/greenhouse.ts', 'utf8');
    const ghMatches = ghFileContent.match(/'([a-z0-9._-]+)'/g);
    if (ghMatches) {
        for (const m of ghMatches) {
            const slug = m.replace(/'/g, '');
            if (slug.length > 2 && !slug.includes('=') && !['per_page', 'content', 'true', 'greenhouse'].includes(slug)) {
                ghSlugs.push(slug);
            }
        }
    }
    // Deduplicate
    const uniqueGhSlugs = [...new Set(ghSlugs)];
    console.log(`  Found ${uniqueGhSlugs.length} unique Greenhouse slugs`);
    const ghResult = await auditSource('Greenhouse', uniqueGhSlugs, checkGreenhouse);

    // 3. Workday — check the companies config
    console.log('\n--- WORKDAY ---');
    const wdFileContent = require('fs').readFileSync('lib/aggregators/workday.ts', 'utf8');
    // Extract company objects from the WORKDAY_COMPANIES array
    const wdSlugMatches = wdFileContent.match(/slug:\s*'([^']+)'/g);
    const wdTenantMatches = wdFileContent.match(/tenant:\s*'([^']+)'/g);
    const wdNameMatches = wdFileContent.match(/name:\s*'([^']+)'/g);

    if (wdSlugMatches && wdTenantMatches && wdNameMatches) {
        const wdCompanies: WorkdayCompany[] = [];
        for (let i = 0; i < wdSlugMatches.length; i++) {
            const slug = wdSlugMatches[i].replace(/slug:\s*'/, '').replace(/'/, '');
            const tenant = wdTenantMatches[i]?.replace(/tenant:\s*'/, '').replace(/'/, '') || '';
            const name = wdNameMatches[i]?.replace(/name:\s*'/, '').replace(/'/, '') || slug;
            if (slug && tenant) wdCompanies.push({ slug, tenant, name });
        }
        console.log(`  Found ${wdCompanies.length} Workday companies`);

        const wdDead: string[] = [];
        const wdAlive: string[] = [];
        for (let i = 0; i < wdCompanies.length; i += 5) {
            const batch = wdCompanies.slice(i, i + 5);
            const results = await Promise.all(batch.map(async c => {
                const ok = await checkWorkday(c);
                return { name: c.name, ok };
            }));
            for (const r of results) {
                if (r.ok) wdAlive.push(r.name);
                else wdDead.push(r.name);
            }
            process.stdout.write(`  [Workday] Checked ${Math.min(i + 5, wdCompanies.length)}/${wdCompanies.length}...\r`);
        }
        console.log(`\n  [Workday] ${wdAlive.length} alive, ${wdDead.length} dead`);
        if (wdDead.length > 0) {
            console.log(`  Dead companies: ${wdDead.join(', ')}`);
        }
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Lever: ${leverResult.dead.length} dead slugs to remove`);
    console.log(`Greenhouse: ${ghResult.dead.length} dead slugs to remove`);
    console.log('Workday: see above');

    // Output the dead slugs as arrays for easy copy-paste removal
    if (leverResult.dead.length > 0) {
        console.log('\n// LEVER — remove these:');
        console.log(JSON.stringify(leverResult.dead));
    }
    if (ghResult.dead.length > 0) {
        console.log('\n// GREENHOUSE — remove these:');
        console.log(JSON.stringify(ghResult.dead));
    }
}

run().catch(console.error);
