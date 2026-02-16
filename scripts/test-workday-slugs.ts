/**
 * Targeted Workday slug tester for major healthcare employers.
 * Tests known slug patterns that the generic discovery script misses.
 * 
 * Usage: npx tsx scripts/test-workday-slugs.ts
 */

const CANDIDATES = [
    // Major health systems — testing multiple slug guesses per company
    { slugs: ['hcahealthcare', 'paralloninc', 'hca'], name: 'HCA Healthcare' },
    { slugs: ['uhsinc', 'uhs', 'universalhealthservicesinc'], name: 'Universal Health Services' },
    { slugs: ['acadiahealthcare', 'acadia'], name: 'Acadia Healthcare' },
    { slugs: ['commonspirithealth', 'commonspirit', 'dignityhealth'], name: 'CommonSpirit Health' },
    { slugs: ['ascension', 'ascensionhealth'], name: 'Ascension' },
    { slugs: ['advocatehealth', 'advocate', 'advocateaurorahealth', 'aah'], name: 'Advocate Health' },
    { slugs: ['adventhealth', 'advent'], name: 'AdventHealth' },
    { slugs: ['bannerhealth', 'banner'], name: 'Banner Health' },
    { slugs: ['northwell', 'northwellhealth'], name: 'Northwell Health' },
    { slugs: ['kaiserpermanente', 'kaiser', 'kaiserperma', 'kp'], name: 'Kaiser Permanente' },
    { slugs: ['mayoclinic', 'mayo'], name: 'Mayo Clinic' },
    { slugs: ['clevelandclinic', 'ccf'], name: 'Cleveland Clinic' },
    { slugs: ['upmc', 'upmchs'], name: 'UPMC' },
    { slugs: ['tenet', 'tenethealth', 'tenethealthcare'], name: 'Tenet Healthcare' },
    { slugs: ['providence', 'providencehealth', 'psjhealth'], name: 'Providence Health' },
    { slugs: ['sutter', 'sutterhealth'], name: 'Sutter Health' },
    { slugs: ['intermountain', 'intermountainhealth', 'intermountainhealthcare'], name: 'Intermountain Healthcare' },
    { slugs: ['bswhealth', 'bswh', 'baylorscottandwhite', 'baylorsw'], name: 'Baylor Scott & White' },
    { slugs: ['corewell', 'corewellhealth'], name: 'Corewell Health' },
    { slugs: ['novant', 'novanthealth'], name: 'Novant Health' },
    { slugs: ['wellstar', 'wellstarhealth'], name: 'WellStar Health' },
    { slugs: ['inova', 'inovahealth'], name: 'Inova Health' },
    { slugs: ['sentara', 'sentarahealthcare'], name: 'Sentara Healthcare' },
    { slugs: ['ochsner', 'ochsnerhealth'], name: 'Ochsner Health' },
    { slugs: ['piedmont', 'piedmonthealthcare'], name: 'Piedmont Healthcare' },
    { slugs: ['henryford', 'henryfordhealth'], name: 'Henry Ford Health' },
    { slugs: ['bjc', 'bjchealthcare'], name: 'BJC HealthCare' },
    { slugs: ['sanford', 'sanfordhealth'], name: 'Sanford Health' },
    { slugs: ['essentia', 'essentiahealth'], name: 'Essentia Health' },
    { slugs: ['lifepoint', 'lifepointhealth'], name: 'LifePoint Health' },
    { slugs: ['chs', 'communityhealthsystems'], name: 'Community Health Systems' },
    { slugs: ['primehealthcare', 'prime'], name: 'Prime Healthcare' },
    { slugs: ['centenecorp', 'centene'], name: 'Centene' },
    { slugs: ['unitedhealth', 'unitedhealthgroup', 'uhg'], name: 'UnitedHealth Group' },
    { slugs: ['cvs', 'cvshealth', 'aetna'], name: 'CVS Health' },
    { slugs: ['geisinger'], name: 'Geisinger' },
    { slugs: ['cedarssinai', 'cedars-sinai', 'cedars'], name: 'Cedars-Sinai' },
    { slugs: ['dukehealth', 'duke'], name: 'Duke Health' },
    { slugs: ['emory', 'emoryhealthcare'], name: 'Emory Healthcare' },
    { slugs: ['houstonmethodist', 'methodist'], name: 'Houston Methodist' },
    { slugs: ['iuhealth', 'indianauniversityhealth'], name: 'Indiana University Health' },
    { slugs: ['johnshopkins', 'jhu', 'hopkinsmedicine'], name: 'Johns Hopkins' },
    { slugs: ['medstarhealth', 'medstar'], name: 'MedStar Health' },
    { slugs: ['mountsinai', 'msinai'], name: 'Mount Sinai' },
    { slugs: ['nm', 'northwesternmedicine'], name: 'Northwestern Medicine' },
    { slugs: ['nyulangone', 'nyu'], name: 'NYU Langone' },
    { slugs: ['pennmedicine', 'penn', 'upenn', 'uphs'], name: 'Penn Medicine' },
    { slugs: ['stanfordhealthcare', 'stanford'], name: 'Stanford Health Care' },
    { slugs: ['uclahealth', 'ucla'], name: 'UCLA Health' },
    { slugs: ['ucsfhealth', 'ucsf'], name: 'UCSF Health' },
    { slugs: ['unchealth', 'unc'], name: 'UNC Health' },
    { slugs: ['vumc', 'vanderbilt'], name: 'Vanderbilt University Medical Center' },
    { slugs: ['yalenewhavenhealth', 'ynhh', 'yale'], name: 'Yale New Haven Health' },
    { slugs: ['hackensackmeridian', 'hackensack', 'hmh'], name: 'Hackensack Meridian' },
    { slugs: ['hartfordhealthcare', 'hartford'], name: 'Hartford HealthCare' },
    { slugs: ['rwjbarnabas', 'rwjbh'], name: 'RWJBarnabas Health' },
    { slugs: ['prismahealth', 'prisma'], name: 'Prisma Health' },
    { slugs: ['wellspan', 'wellspanhealth'], name: 'WellSpan Health' },
    // Behavioral / telehealth
    { slugs: ['teladochealth', 'teladoc'], name: 'Teladoc Health' },
    { slugs: ['talkiatry'], name: 'Talkiatry' },
    { slugs: ['geodhealth', 'geode'], name: 'Geode Health' },
    { slugs: ['mindpath', 'mindpathhealth'], name: 'Mindpath Health' },
];

const SITES = ['SearchJobs', 'search', 'External', 'en-US', 'Careers', 'jobs'];
const INSTANCES = [1, 2, 3, 4, 5];

async function test(slug: string, inst: number, site: string): Promise<{ total: number } | null> {
    const url = `https://${slug}.wd${inst}.myworkdayjobs.com/wday/cxs/${slug}/${site}/jobs`;
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 1, offset: 0, searchText: '' }),
            signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!res.ok) return null;
        const data = await res.json();
        return (data?.total || 0) > 0 ? { total: data.total } : null;
    } catch { return null; }
}

async function main() {
    console.log(`Testing ${CANDIDATES.length} companies...\n`);
    const found: Array<{ slug: string; inst: number; site: string; name: string; total: number }> = [];

    for (const candidate of CANDIDATES) {
        let discovered = false;
        for (const slug of candidate.slugs) {
            if (discovered) break;
            for (const inst of INSTANCES) {
                if (discovered) break;
                for (const site of SITES) {
                    const r = await test(slug, inst, site);
                    if (r) {
                        console.log(`✅ ${candidate.name}: wd${inst}/${slug}/${site} (${r.total} jobs)`);
                        found.push({ slug, inst, site, name: candidate.name, total: r.total });
                        discovered = true;
                        break;
                    }
                }
            }
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`RESULTS: ${found.length} Workday sites from ${CANDIDATES.length} companies`);
    console.log('='.repeat(60));

    console.log('\n// Add to WORKDAY_COMPANIES in workday.ts:');
    for (const c of found.sort((a, b) => b.total - a.total)) {
        console.log(`  { slug: '${c.slug}', instance: ${c.inst}, site: '${c.site}', name: '${c.name.replace(/'/g, "\\'")}' }, // ${c.total} total jobs`);
    }
}

main().catch(console.error);
