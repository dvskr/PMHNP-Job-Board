/**
 * Discover which employers have Workday career sites.
 * Tests URL patterns across wd1-wd5 instances and common site names.
 * 
 * Usage: npx tsx scripts/discover-workday-sites.ts
 */

import { TOP_EMPLOYERS } from '../lib/aggregators/constants';

// Common Workday site path names
const SITE_NAMES = ['SearchJobs', 'search', 'External', 'en-US', 'Careers', 'jobs'];
// Workday instance numbers (1-5)
const INSTANCES = [1, 2, 3, 4, 5];

interface WorkdayConfig {
    slug: string;
    instance: number;
    site: string;
    name: string;
    totalJobs: number;
}

function companyToSlugs(name: string): string[] {
    const base = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const slugs: string[] = [];

    // No spaces version: "HCA Healthcare" -> "hcahealthcare"
    slugs.push(base.replace(/\s+/g, ''));

    // Hyphenated: "HCA Healthcare" -> "hca-healthcare"  
    const words = base.split(/\s+/);
    if (words.length > 1) {
        slugs.push(words.join('-'));
        slugs.push(words.join('_'));
        // First word only: "hca"
        slugs.push(words[0]);
    }

    return [...new Set(slugs)];
}

async function testWorkdayUrl(slug: string, instance: number, site: string): Promise<{ ok: boolean; totalJobs: number }> {
    const url = `https://${slug}.wd${instance}.myworkdayjobs.com/wday/cxs/${slug}/${site}/jobs`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 1, offset: 0, searchText: '' }),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) return { ok: false, totalJobs: 0 };

        const data = await res.json();
        const totalJobs = data?.total || 0;
        return { ok: totalJobs > 0, totalJobs };
    } catch {
        return { ok: false, totalJobs: 0 };
    }
}

async function discoverCompany(name: string): Promise<WorkdayConfig | null> {
    const slugs = companyToSlugs(name);

    for (const slug of slugs) {
        for (const inst of INSTANCES) {
            for (const site of SITE_NAMES) {
                const { ok, totalJobs } = await testWorkdayUrl(slug, inst, site);
                if (ok) {
                    return { slug, instance: inst, site, name, totalJobs };
                }
            }
        }
    }

    return null;
}

async function main() {
    console.log('🔍 Discovering Workday career sites...\n');

    // Use TOP_EMPLOYERS from constants + some major healthcare systems
    const additionalHealthcare = [
        'Banner Health', 'Geisinger', 'Intermountain Health', 'Ochsner Health',
        'Parkland Health', 'UnityPoint Health', 'Wellstar Health', 'Advocate Aurora',
        'Atrium Health', 'Baptist Health', 'Bon Secours Mercy Health', 'Cedars-Sinai',
        'ChristianaCare', 'Duke Health', 'Emory Healthcare', 'Houston Methodist',
        'Indiana University Health', 'Johns Hopkins', 'Mass General Brigham',
        'MedStar Health', 'Michigan Medicine', 'Mount Sinai', 'NewYork-Presbyterian',
        'Northwestern Medicine', 'NYU Langone', 'Ohio State University', 'Penn Medicine',
        'Rush University', 'Sanford Health', 'Stanford Health Care', 'UCLA Health',
        'UCSF Health', 'UNC Health', 'Vanderbilt University Medical Center',
        'Virginia Mason', 'Wake Forest Baptist', 'Yale New Haven Health',
        'Centura Health', 'Cone Health', 'Covenant Health', 'Deaconess Health',
        'Encompass Health', 'Froedtert Health', 'Hackensack Meridian', 'Hartford HealthCare',
        'Hennepin Healthcare', 'Lee Health', 'LCMC Health', 'MaineHealth',
        'Marshfield Clinic', 'Memorial Healthcare', 'Mercy Health', 'MetroHealth',
        'NorthShore', 'OhioHealth', 'Prisma Health', 'RWJBarnabas Health',
        'SCL Health', 'Sharp HealthCare', 'Summa Health', 'Tampa General Hospital',
        'UnityPoint Health', 'UPMC', 'Valley Health', 'WellSpan Health',
        // Telehealth / behavioral health employers
        'Teladoc Health', 'MDLive', 'Doctor On Demand', 'Ginger', 'Noom',
        'Hims & Hers', 'Ro Health', 'Done ADHD', 'Cerebral', 'BetterHelp',
        'Spring Health', 'Lyra Health', 'Calm', 'Headspace',
        // Staffing / travel nursing
        'AMN Healthcare', 'Cross Country Healthcare', 'Medical Solutions',
        'Aya Healthcare', 'Maxim Healthcare', 'CHG Healthcare', 'CompHealth',
        'Supplemental Health Care', 'Jackson Healthcare', 'Favorite Healthcare',
    ];

    const allCompanies = [...new Set([...TOP_EMPLOYERS, ...additionalHealthcare])];
    console.log(`Testing ${allCompanies.length} companies...\n`);

    const found: WorkdayConfig[] = [];
    let tested = 0;

    // Process in parallel batches of 5 (to avoid overwhelming)
    const BATCH_SIZE = 5;
    for (let i = 0; i < allCompanies.length; i += BATCH_SIZE) {
        const batch = allCompanies.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(name => discoverCompany(name)));

        for (let j = 0; j < results.length; j++) {
            tested++;
            const result = results[j];
            if (result) {
                found.push(result);
                console.log(`✅ ${result.name}: wd${result.instance}/${result.slug}/${result.site} (${result.totalJobs} jobs)`);
            } else {
                // Only log failures for debugging — comment out in production
                // console.log(`  ❌ ${batch[j]}`);
            }
        }

        // Progress update
        if (tested % 20 === 0) {
            console.log(`  ... ${tested}/${allCompanies.length} tested, ${found.length} found`);
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`RESULTS: ${found.length} Workday sites found from ${tested} companies`);
    console.log('='.repeat(60));

    // Output as TypeScript config
    console.log('\n// Copy this into WORKDAY_COMPANIES in workday.ts:');
    console.log('const WORKDAY_COMPANIES: WorkdayCompany[] = [');
    for (const c of found.sort((a, b) => b.totalJobs - a.totalJobs)) {
        console.log(`  { slug: '${c.slug}', instance: ${c.instance}, site: '${c.site}', name: '${c.name.replace(/'/g, "\\'")}' }, // ${c.totalJobs} total jobs`);
    }
    console.log('];');
}

main().catch(console.error);
