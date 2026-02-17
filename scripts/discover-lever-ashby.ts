/**
 * Discover healthcare companies on Lever and Ashby platforms.
 * Tests candidate slugs against both APIs.
 * 
 * Usage: npx tsx scripts/discover-lever-ashby.ts
 */

// ---- Lever candidates ----
const LEVER_CANDIDATES = [
    'springhealth', 'spring-health', 'cerebral', 'brightside', 'brightside-health',
    'doneadhd', 'done', 'headway', 'alma', 'alma-health', 'rula', 'rulahealth',
    'grow-therapy', 'growtherapy', 'pathlight', 'elemy', 'mantrahealth', 'mantra',
    'noom', 'hims-hers', 'himshers', 'hims', 'teladochealth', 'teladoc',
    'mdlive', 'amwell', 'ginger-io', 'ginger', 'wellnite',
    'geodehealth', 'geode-health', 'mindpathhealth', 'mindpath', 'mindpath-health',
    'refreshmental', 'refresh-mental', 'thriveworks', 'thrive-works',
    'valleyoaks', 'innova', 'innovative-health', 'compass-health',
    'compasshealth', 'nystrom', 'apexmindcare', 'ellenhorn', 'sondermind',
    'octavehealth', 'octave', 'blueprint-health',
    'tavahealth', 'tava', 'zen-care', 'zencare',
    'zocdoc', 'helloalma', 'betterhelp', 'two-chairs', 'twochairs',
    'groupsrecovertogether', 'groups-recover-together',
    'monument', 'bicycle-health', 'ophelia', 'boulder-care',
    'iris-telehealth', 'iristelehealth', 'greenleaf',
    'wellbridge', 'totalmentalhealth', 'total-mental-health',
    'summit-healthcare', 'aptihealth', 'quartet', 'quartethealth',
];
const EXISTING_LEVER = [
    'lifestance', 'talkiatry', 'includedhealth', 'lyrahealth', 'carbonhealth',
    'prosper', 'bighealth', 'genesis', 'sesame', 'mindful', 'athenapsych',
    'seven-starling', 'beckley-clinical', 'synapticure', 'arundellodge',
];

// ---- Ashby candidates ----
const ASHBY_CANDIDATES = [
    'spring-health', 'springhealth', 'cerebral', 'headway', 'alma',
    'rula', 'grow-therapy', 'growtherapy', 'sondermind', 'brightside-health',
    'brightside', 'tava-health', 'tavahealth', 'octave', 'noom',
    'hims', 'hims-and-hers', 'done-adhd', 'done-health', 'geode-health',
    'mindpath', 'thriveworks', 'refresh-mental-health', 'mantra-health',
    'pathlight', 'compass-health', 'valant', 'apexmindcare',
    'talkspace', 'two-chairs', 'twochairs', 'groups-recover-together',
    'monument', 'bicycle-health', 'ophelia', 'boulder-care', 'done',
    'iris-telehealth', 'iristelehealth',
    'greenleaf', 'greenleaf-behavioral-health',
    'quartet', 'quartethealth', 'aptihealth', 'wellbridge',
    'summit-behavioral-health', 'totalmentalhealth',
    'zen-care', 'zencare', 'zocdoc', 'helloalma',
    'cerebral-inc', 'talkiatry', 'lifestance',
];
const EXISTING_ASHBY = ['equip', 'ReklameHealth', 'legionhealth', 'array-behavioral-care', 'blossom-health'];

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    // ---- Lever ----
    const leverToTest = LEVER_CANDIDATES.filter(s => !EXISTING_LEVER.includes(s));
    console.log(`\nTesting ${leverToTest.length} Lever slugs...\n`);

    const leverFound: Array<{ slug: string; count: number }> = [];
    for (const slug of leverToTest) {
        try {
            const r = await fetch(`https://api.lever.co/v0/postings/${slug}`, {
                signal: AbortSignal.timeout(5000),
            });
            if (!r.ok) continue;
            const data = await r.json();
            const count = Array.isArray(data) ? data.length : 0;
            if (count > 0) {
                console.log(`✅ LEVER: ${slug} -> ${count} jobs`);
                leverFound.push({ slug, count });
            }
        } catch { }
        await sleep(200);
    }
    console.log(`\nLever: ${leverFound.length} new companies found`);

    // ---- Ashby ----
    const ashbyToTest = ASHBY_CANDIDATES.filter(s => !EXISTING_ASHBY.includes(s.toLowerCase()));
    console.log(`\nTesting ${ashbyToTest.length} Ashby slugs...\n`);

    const ashbyFound: Array<{ slug: string; count: number }> = [];
    for (const slug of ashbyToTest) {
        try {
            const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, {
                signal: AbortSignal.timeout(5000),
            });
            if (!r.ok) continue;
            const data = await r.json();
            const count = (data.jobs || []).length;
            if (count > 0) {
                console.log(`✅ ASHBY: ${slug} -> ${count} jobs`);
                ashbyFound.push({ slug, count });
            }
        } catch { }
        await sleep(200);
    }
    console.log(`\nAshby: ${ashbyFound.length} new companies found`);

    // ---- Summary ----
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    if (leverFound.length > 0) {
        console.log('\nNew Lever companies to add:');
        for (const c of leverFound.sort((a, b) => b.count - a.count)) {
            console.log(`  '${c.slug}',  // ${c.count} total jobs`);
        }
    }
    if (ashbyFound.length > 0) {
        console.log('\nNew Ashby companies to add:');
        for (const c of ashbyFound.sort((a, b) => b.count - a.count)) {
            console.log(`  { slug: "${c.slug}", name: "${c.slug}" },  // ${c.count} total jobs`);
        }
    }
}

main().catch(console.error);
