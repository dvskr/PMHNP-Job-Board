/**
 * ATS Slug Discovery Script
 * 
 * Discovers which healthcare/behavioral health companies have career pages
 * on Greenhouse, Lever, Ashby, and Workday by testing their public APIs.
 * 
 * Sources for company names:
 * - TOP_EMPLOYERS from constants.ts
 * - Major US health systems (top 100)
 * - Behavioral health / telehealth companies
 * - Staffing agencies
 * - Community mental health centers
 * 
 * Usage: npx tsx scripts/discover-all-ats-slugs.ts
 * 
 * Output: Prints valid slugs organized by platform, ready to copy into aggregator files.
 */

import { TOP_EMPLOYERS } from '../lib/aggregators/constants';

// ============================================================
// MASTER COMPANY LIST
// Comprehensive list of healthcare companies to test across all ATS platforms.
// Each entry generates multiple slug variants (lowercase, hyphenated, etc.)
// ============================================================

const HEALTHCARE_COMPANIES = [
    // --- Major Health Systems (Top 50 by bed count) ---
    'HCA Healthcare', 'CommonSpirit Health', 'Ascension', 'Trinity Health',
    'Providence Health', 'Tenet Healthcare', 'Universal Health Services',
    'Community Health Systems', 'Advocate Health', 'AdventHealth',
    'Sutter Health', 'Baylor Scott White', 'Northwell Health', 'Kaiser Permanente',
    'Cleveland Clinic', 'Mayo Clinic', 'UPMC', 'Intermountain Health',
    'Atrium Health', 'Bon Secours Mercy Health', 'Corewell Health',
    'Novant Health', 'WellStar Health', 'Sentara Healthcare', 'Ochsner Health',
    'Piedmont Healthcare', 'Henry Ford Health', 'BJC HealthCare',
    'Banner Health', 'Geisinger', 'Inova Health', 'Sanford Health',
    'Essentia Health', 'LifePoint Health', 'Prime Healthcare',
    'MedStar Health', 'Hartford HealthCare', 'Hackensack Meridian',
    'RWJBarnabas Health', 'Prisma Health', 'WellSpan Health',
    'Lee Health', 'MaineHealth', 'OhioHealth', 'Froedtert Health',
    'Summa Health', 'Tampa General Hospital', 'Cone Health',

    // --- Academic Medical Centers ---
    'Cedars-Sinai', 'Duke Health', 'Emory Healthcare', 'Houston Methodist',
    'Indiana University Health', 'Johns Hopkins', 'Mass General Brigham',
    'Mount Sinai', 'Northwestern Medicine', 'NYU Langone', 'Penn Medicine',
    'Stanford Health Care', 'UCLA Health', 'UCSF Health', 'UNC Health',
    'Vanderbilt University Medical Center', 'Yale New Haven Health',
    'Michigan Medicine', 'Oregon Health Science University', 'Rush University',

    // --- Behavioral Health / Psychiatry Specialty ---
    'LifeStance Health', 'Acadia Healthcare', 'Talkiatry', 'SonderMind',
    'Spring Health', 'Cerebral', 'Headway', 'Alma', 'Rula',
    'Grow Therapy', 'Brightside Health', 'Geode Health', 'Mindpath Health',
    'Refresh Mental Health', 'Thriveworks', 'Array Behavioral Care',
    'Pathlight Mood Anxiety', 'Noom', 'BetterHelp', 'Talkspace',
    'Two Chairs', 'Groups Recover Together', 'Monument', 'Bicycle Health',
    'Ophelia', 'Boulder Care', 'Iris Telehealth', 'Quartet Health',
    'Aptihealth', 'Octave', 'Valant', 'Blueprint Health',
    'Wellbridge', 'Total Mental Health', 'Summit Healthcare',
    'Compass Health', 'Valley Oaks Health', 'Ellenhorn',
    'Greenleaf Behavioral Health', 'Seven Starling', 'SynaptiCure',
    'Beckley Clinical', 'Arundel Lodge', 'AthenaPsych',
    'Equip Health', 'Reklame Health', 'Legion Health', 'Blossom Health',
    'Done ADHD', 'Hims Hers', 'Tava Health', 'Zen Care',
    'Mantra Health', 'Big Health', 'Calm', 'Headspace',
    'Ginger', 'Lyra Health', 'Included Health', 'Carbon Health',
    'Prosper Health', 'Sesame Care',

    // --- Telehealth ---
    'Teladoc Health', 'MDLive', 'Doctor On Demand', 'Amwell',
    'Ro Health', 'Wheel Health', 'Hims and Hers',

    // --- Staffing / Travel Nursing ---
    'AMN Healthcare', 'Cross Country Healthcare', 'Medical Solutions',
    'Aya Healthcare', 'Maxim Healthcare', 'CHG Healthcare', 'CompHealth',
    'Supplemental Health Care', 'Jackson Healthcare', 'Favorite Healthcare',
    'Weatherby Healthcare', 'Locum Tenens', 'Barton Associates',

    // --- Large Employers (non-health specific but may hire PMHNPs) ---
    'CVS Health', 'Centene', 'UnitedHealth Group', 'Cigna',
    'Humana', 'Molina Healthcare', 'Anthem', 'Aetna',
    'Department of Veterans Affairs', 'Indian Health Service',
];

// Deduplicate with TOP_EMPLOYERS
const ALL_COMPANIES = [...new Set([...TOP_EMPLOYERS, ...HEALTHCARE_COMPANIES])];

// ============================================================
// SLUG GENERATION
// ============================================================

function companyToSlugs(name: string): string[] {
    const base = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const slugs: string[] = [];

    // No spaces: "HCA Healthcare" -> "hcahealthcare"
    slugs.push(base.replace(/\s+/g, ''));

    // Hyphenated: "HCA Healthcare" -> "hca-healthcare"
    const words = base.split(/\s+/);
    if (words.length > 1) {
        slugs.push(words.join('-'));
        slugs.push(words[0]); // First word only
        // Abbreviation for multi-word names
        if (words.length >= 2) {
            slugs.push(words.map(w => w[0]).join('')); // "bjc", "uhg", etc.
        }
    }

    // Special healthcare abbreviations
    const abbrevMap: Record<string, string[]> = {
        'hca healthcare': ['hca', 'paralloninc'],
        'universal health services': ['uhs', 'uhsinc'],
        'advocate health': ['aah', 'advocateaurorahealth'],
        'baylor scott white': ['bswh', 'bswhealth'],
        'cleveland clinic': ['ccf'],
        'kaiser permanente': ['kp'],
        'mass general brigham': ['mgb', 'massgeneralbrigham'],
        'johns hopkins': ['jhu', 'hopkinsmedicine'],
        'penn medicine': ['uphs', 'upenn'],
        'indiana university health': ['iuhealth'],
        'vanderbilt university medical center': ['vumc'],
        'yale new haven health': ['ynhh'],
        'hackensack meridian': ['hmh'],
        'rwjbarnabas health': ['rwjbh'],
        'oregon health science university': ['ohsu'],
        'hims hers': ['hims', 'hims-and-hers'],
        'hims and hers': ['hims', 'hims-and-hers'],
        'done adhd': ['done', 'doneadhd', 'done-adhd'],
        'unitedhealth group': ['uhg', 'unitedhealth', 'optum'],
        'cvs health': ['cvs', 'cvshealth', 'aetna'],
    };

    const lowerName = name.toLowerCase();
    for (const [key, extras] of Object.entries(abbrevMap)) {
        if (lowerName.includes(key)) {
            slugs.push(...extras);
        }
    }

    return [...new Set(slugs)];
}

// ============================================================
// ATS API TESTERS
// ============================================================

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testGreenhouseSlug(slug: string): Promise<number | null> {
    try {
        const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) return null;
        const data = await r.json();
        const count = data?.jobs?.length || 0;
        return count > 0 ? count : null;
    } catch { return null; }
}

async function testLeverSlug(slug: string): Promise<number | null> {
    try {
        const r = await fetch(`https://api.lever.co/v0/postings/${slug}`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) return null;
        const data = await r.json();
        const count = Array.isArray(data) ? data.length : 0;
        return count > 0 ? count : null;
    } catch { return null; }
}

async function testAshbySlug(slug: string): Promise<number | null> {
    try {
        const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) return null;
        const data = await r.json();
        const count = (data?.jobs || []).length;
        return count > 0 ? count : null;
    } catch { return null; }
}

const WD_INSTANCES = [1, 2, 3, 4, 5];
const WD_SITES = ['SearchJobs', 'search', 'External', 'en-US', 'Careers', 'jobs'];

async function testWorkdaySlug(slug: string): Promise<{ instance: number; site: string; total: number } | null> {
    for (const inst of WD_INSTANCES) {
        for (const site of WD_SITES) {
            try {
                const url = `https://${slug}.wd${inst}.myworkdayjobs.com/wday/cxs/${slug}/${site}/jobs`;
                const r = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ limit: 1, offset: 0, searchText: '' }),
                    signal: AbortSignal.timeout(4000),
                });
                if (!r.ok) continue;
                const data = await r.json();
                const total = data?.total || 0;
                if (total > 0) return { instance: inst, site, total };
            } catch { continue; }
        }
    }
    return null;
}

// ============================================================
// MAIN DISCOVERY
// ============================================================

interface DiscoveredSlug {
    companyName: string;
    slug: string;
    count: number;
    extra?: { instance: number; site: string };
}

async function main() {
    console.log(`\n🔍 ATS Slug Discovery Script`);
    console.log(`   Testing ${ALL_COMPANIES.length} companies across 4 ATS platforms\n`);

    const greenhouse: DiscoveredSlug[] = [];
    const lever: DiscoveredSlug[] = [];
    const ashby: DiscoveredSlug[] = [];
    const workday: DiscoveredSlug[] = [];

    let tested = 0;
    const total = ALL_COMPANIES.length;

    for (const company of ALL_COMPANIES) {
        tested++;
        const slugs = companyToSlugs(company);

        // Test all platforms in parallel for each company
        for (const slug of slugs) {
            const [gh, lv, ab] = await Promise.all([
                testGreenhouseSlug(slug),
                testLeverSlug(slug),
                testAshbySlug(slug),
            ]);

            if (gh && !greenhouse.some(g => g.slug === slug)) {
                greenhouse.push({ companyName: company, slug, count: gh });
                console.log(`  ✅ GREENHOUSE: ${company} -> ${slug} (${gh} jobs)`);
            }
            if (lv && !lever.some(l => l.slug === slug)) {
                lever.push({ companyName: company, slug, count: lv });
                console.log(`  ✅ LEVER: ${company} -> ${slug} (${lv} jobs)`);
            }
            if (ab && !ashby.some(a => a.slug === slug)) {
                ashby.push({ companyName: company, slug, count: ab });
                console.log(`  ✅ ASHBY: ${company} -> ${slug} (${ab} jobs)`);
            }

            // Small delay per slug to be respectful
            await sleep(100);
        }

        // Test Workday separately (slower due to instance x site combinations)
        for (const slug of slugs) {
            const wd = await testWorkdaySlug(slug);
            if (wd && !workday.some(w => w.slug === slug)) {
                workday.push({ companyName: company, slug, count: wd.total, extra: { instance: wd.instance, site: wd.site } });
                console.log(`  ✅ WORKDAY: ${company} -> wd${wd.instance}/${slug}/${wd.site} (${wd.total} jobs)`);
                break; // One Workday hit per company is enough
            }
        }

        // Progress
        if (tested % 25 === 0) {
            console.log(`\n  📊 Progress: ${tested}/${total} companies | GH:${greenhouse.length} LV:${lever.length} AB:${ashby.length} WD:${workday.length}\n`);
        }
    }

    // ============================================================
    // OUTPUT RESULTS
    // ============================================================

    console.log('\n' + '='.repeat(70));
    console.log('DISCOVERY RESULTS');
    console.log('='.repeat(70));

    const printSection = (title: string, items: DiscoveredSlug[]) => {
        console.log(`\n### ${title} (${items.length} found) ###`);
        if (items.length === 0) {
            console.log('  (none)');
            return;
        }
        for (const item of items.sort((a, b) => b.count - a.count)) {
            if (item.extra) {
                console.log(`  { slug: '${item.slug}', instance: ${item.extra.instance}, site: '${item.extra.site}', name: '${item.companyName.replace(/'/g, "\\'")}' }, // ${item.count} total jobs`);
            } else {
                console.log(`  '${item.slug}',  // ${item.companyName} - ${item.count} jobs`);
            }
        }
    };

    printSection('GREENHOUSE', greenhouse);
    printSection('LEVER', lever);
    printSection('ASHBY', ashby);
    printSection('WORKDAY', workday);

    console.log('\n' + '='.repeat(70));
    console.log(`TOTALS: GH:${greenhouse.length} LV:${lever.length} AB:${ashby.length} WD:${workday.length}`);
    console.log('='.repeat(70) + '\n');
}

main().catch(console.error);
