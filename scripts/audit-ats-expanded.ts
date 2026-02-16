/**
 * EXPANDED company discovery scan - testing 150+ mental health company slugs
 */
import { isRelevantJob } from '../lib/utils/job-filter';

const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── All companies already in our config (skip these) ───
const ALREADY_ADDED = new Set([
    'sondermind', 'headway', 'modernhealth', 'mantrahealth', 'cerebral', 'twochairs',
    'talkspace', 'ayahealthcare', 'amwell', 'octave', 'growtherapy',
    'blueskytelepsych', 'bicyclehealth', 'signifyhealth', 'valerahealth',
    'charliehealth', 'blackbirdhealth', 'ophelia',
    'springhealth66', 'omadahealth', 'brave',
    'betterhelp', 'firsthand', 'compasspathways',
    'alma', 'cortica', 'galileo', 'amaehealth', 'pelago',
    // Lever
    'lifestance', 'talkiatry', 'includedhealth', 'lyrahealth', 'carbonhealth', 'prosper',
]);

// ─── Massive list of mental health / behavioral health / telehealth companies ───
const CANDIDATES = [
    // From search results & industry directories
    'iristelehealth', 'iris', 'irishealth',
    'legionhealth', 'legion',
    'forgehealth', 'forge',
    'arrayhealth', 'arraybehavioral', 'array',
    'neuroflow',
    'acadiahealthcare', 'acadia',
    'psychplus', 'psychplusinc',
    'daybreakhealth', 'daybreak',
    'marblehealth', 'marble',
    'openloophealth', 'openloop',
    'zealthy',
    'lifemd',
    'xrhealth',
    'uphelai', 'upheal',
    'withinhealth', 'within',
    'freedai', 'freed',
    'parallellearning', 'parallel',
    'asyouare',
    'avelahealth', 'avela',
    'fortahealth', 'forta',
    'brightsidehealth', 'brightside',
    // From top PMHNP employers lists
    'mindpath', 'mindpathhealth', 'mindpathcare',
    'rula', 'rulahealth',
    'teladoc', 'teladochealth',
    'hims', 'forhims', 'himsandhers',
    'ginger', 'gingerio',
    'headspace', 'headspacehealth',
    'carelon', 'carelonbehavioralhealth',
    'magellanhealth', 'magellan',
    'compsych',
    'centene',
    'centurionmanagedcare', 'centurion',
    'wexfordhealth', 'wexford',
    'wellpath', 'wellpathcare',
    'correctcare', 'youthcareinc',
    'pathlight', 'pathmentalhealth',
    'easterseals',
    'nami',
    'menningerclnic', 'menninger',
    'mclean', 'mcleanhospital',
    'sheppardpratt',
    'hazelden', 'hazeldenbettyford', 'bettyford',
    'rogershospital', 'rogersbh', 'rogersbehavioralhealth',
    'caron', 'carontreatment',
    'centerstone',
    'devereux', 'devereuxorg',
    'elwyn',
    'fideliscare',
    'genesishealthcare', 'genesis',
    // Telehealth & digital mental health startups
    'talkiatryhealth',
    'sesamecare', 'sesame',
    'plushcare',
    'khealth', 'k-health',
    'cerebralhealth',
    'donehealth', 'getdone', 'doneofficially',
    'monument', 'joinmonument', 'monumenthealth',
    'geodehealth', 'geode',
    'tavahealth', 'tava',
    'innerwell', 'innerwellhealth',
    'nuelife', 'nuelifehealth',
    'mindbloom', 'mindbloomhealth',
    'fieldtriphealth', 'fieldtrip',
    'numinus',
    'joyous', 'joyoushealth',
    'novamind',
    'atailife', 'atai',
    // Health systems with behavioral health
    'hackensackmeridian', 'hackensack',
    'pennmedicine', 'penn',
    'mghospital', 'massgeneral',
    'mayoclinic', 'mayo',
    'clevelandclinic', 'cleveland',
    'johnshopkins', 'hopkins',
    // Staffing that uses Greenhouse/Lever
    'crosscountry', 'crosscountryhealthcare',
    'amsn', 'supplementalhealthcare',
    'trustaff',
    'fastaff',
    'medpro', 'medprostaffing',
    'maxim', 'maximhealthcare',
    // EAP / corporate mental health
    'lyra', 'lyrahealthinc',
    'spring', 'springhealthinc',
    'virta', 'virtahealth',
    'omada',
    'noom', 'noomhealth',
    'workit', 'workithealth',
    'boulder', 'bouldercare',
    'monumental', 'monumentalhealth',
    // Additional telemental health
    'telapsychiatry',
    'abcpediatrics',
    'littleotter', 'littleotterhealth',
    'greenspace', 'greenspacehealth',
    'bighealth',
    'silvercloudheath', 'silvercloud',
    'calmcom', 'calm',
    'moodfit',
    'woebot', 'woebothealth',
    'youper',
    'wysa',
    'talktobot',
    'elomida',
    'claritytherapy',
    'wellnest',
    'kindhealth', 'kindhealthtx',
    'altamental', 'altamentalhealthsolutions',
    'summithealth',
    'refugerecovery', 'refuge',
    'sequoia', 'sequoiamentalhealth',
];

async function testGreenhouse(slug: string) {
    const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const jobs = data.jobs || [];
    const pmhnp = jobs.filter((j: any) => isRelevantJob(j.title || '', j.content || ''));
    const recent = pmhnp.filter((j: any) => new Date(j.updated_at) >= THIRTY_DAYS_AGO);
    return { total: jobs.length, pmhnp: pmhnp.length, recent: recent.length };
}

async function testLever(slug: string) {
    const url = `https://api.lever.co/v0/postings/${slug}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const postings = await r.json();
    if (!Array.isArray(postings)) return null;
    const pmhnp = postings.filter((p: any) => {
        const desc = [p.descriptionPlain, p.description, ...(p.lists?.map((l: any) => l.content) || [])].join(' ');
        return isRelevantJob(p.text || '', desc);
    });
    const recent = pmhnp.filter((p: any) => new Date(p.createdAt) >= THIRTY_DAYS_AGO);
    return { total: postings.length, pmhnp: pmhnp.length, recent: recent.length };
}

async function main() {
    const uniqueSlugs = [...new Set(CANDIDATES)].filter(s => !ALREADY_ADDED.has(s));
    console.log(`Testing ${uniqueSlugs.length} new company slugs on both Greenhouse + Lever...\n`);

    const ghHits: Array<{ slug: string; total: number; pmhnp: number; recent: number }> = [];
    const leverHits: Array<{ slug: string; total: number; pmhnp: number; recent: number }> = [];

    for (const slug of uniqueSlugs) {
        // Test Greenhouse
        try {
            const gh = await testGreenhouse(slug);
            if (gh && gh.total > 0) {
                ghHits.push({ slug, ...gh });
                if (gh.pmhnp > 0) {
                    console.log(`🟢 GH  ${slug}: ${gh.total} total, ${gh.pmhnp} PMHNP, ${gh.recent} recent`);
                }
            }
        } catch { }

        // Test Lever
        try {
            const lv = await testLever(slug);
            if (lv && lv.total > 0) {
                leverHits.push({ slug, ...lv });
                if (lv.pmhnp > 0) {
                    console.log(`🟢 LEV ${slug}: ${lv.total} total, ${lv.pmhnp} PMHNP, ${lv.recent} recent`);
                }
            }
        } catch { }

        await sleep(200);
    }

    console.log('\n════════════════════════════════');
    console.log(' RESULTS');
    console.log('════════════════════════════════\n');

    // Greenhouse with PMHNP
    console.log('GREENHOUSE — HAS PMHNP JOBS:');
    ghHits.filter(h => h.pmhnp > 0).sort((a, b) => b.pmhnp - a.pmhnp)
        .forEach(h => console.log(`  ✅ ${h.slug}: ${h.pmhnp} PMHNP (${h.recent} recent) / ${h.total} total`));

    console.log('\nGREENHOUSE — MONITORING (valid, 0 PMHNP):');
    ghHits.filter(h => h.pmhnp === 0).sort((a, b) => b.total - a.total)
        .forEach(h => console.log(`  ⬜ ${h.slug}: ${h.total} total jobs`));

    console.log('\nLEVER — HAS PMHNP JOBS:');
    leverHits.filter(h => h.pmhnp > 0).sort((a, b) => b.pmhnp - a.pmhnp)
        .forEach(h => console.log(`  ✅ ${h.slug}: ${h.pmhnp} PMHNP (${h.recent} recent) / ${h.total} total`));

    console.log('\nLEVER — MONITORING (valid, 0 PMHNP):');
    leverHits.filter(h => h.pmhnp === 0).sort((a, b) => b.total - a.total)
        .forEach(h => console.log(`  ⬜ ${h.slug}: ${h.total} total jobs`));

    const totalNewPMHNP = ghHits.reduce((s, h) => s + h.pmhnp, 0) + leverHits.reduce((s, h) => s + h.pmhnp, 0);
    console.log(`\nTotal new PMHNP jobs found: ${totalNewPMHNP}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
