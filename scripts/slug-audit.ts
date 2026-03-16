/**
 * Live ATS Slug Audit
 * Tests a sample from each ATS platform to see which slugs are active and returning PMHNP jobs.
 * Tests Lever (all 40), Ashby (all 65), BambooHR (all 50).
 * Greenhouse and Workday are sampled (first 50 each) since they're large.
 */
import * as fs from 'fs'

const out: string[] = []
function log(s: string) { out.push(s); console.log(s) }

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ─── LEVER ───
const LEVER_SLUGS = [
    'lifestance', 'talkiatry', 'includedhealth', 'lyrahealth', 'carbonhealth',
    'prosper', 'bighealth', 'genesis', 'sesame', 'mindful', 'athenapsych',
    'seven-starling', 'beckley-clinical', 'synapticure', 'arundellodge',
    'ro', 'advocate', 'ucsf', 'lunaphysicaltherapy', 'guidestareldercare',
    'next-health', 'ekohealth', 'heartbeathealth', 'swordhealth',
    'aledade', 'clarifyhealth', 'enter.health', 'heyjane.co', 'journeyclinical',
    'koalahealth', 'myplacehealth', 'nimblerx', 'pointclickcare', 'pplacareers.org',
    'salvohealth', 'sprinterhealth', 'vivo-care', 'wepclinical', 'zushealth',
]

async function testLever(slug: string) {
    try {
        const res = await fetch(`https://api.lever.co/v0/postings/${slug}`, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) return { slug, status: 'error', code: res.status, total: 0, pmhnp: 0 }
        const jobs = await res.json()
        const total = jobs.length
        const pmhnp = jobs.filter((j: any) => {
            const text = `${j.text} ${j.descriptionPlain || ''}`.toLowerCase()
            return text.includes('pmhnp') || text.includes('psychiatric') || text.includes('mental health nurse')
        }).length
        return { slug, status: 'ok', code: 200, total, pmhnp }
    } catch { return { slug, status: 'timeout', code: 0, total: 0, pmhnp: 0 } }
}

// ─── ASHBY ───
const ASHBY_SLUGS = [
    'equip', 'ReklameHealth', 'legionhealth', 'array-behavioral-care', 'blossom-health',
    'sondermind', 'hims-and-hers', 'rula', 'tavahealth', 'sesame', 'wheel', 'oh', 'prime',
    'foresight', 'bravehealth', 'visanahealth', 'finni-health', 'annaautismcare',
    'claritypediatrics', 'nest-health', 'cylinderhealth', 'tandem-health', 'virtahealth',
    'abridge', 'akasa', 'ambiencehealthcare', 'anterior', 'august-health',
    'candidhealth', 'commure', 'foundationhealthcareers',
    'hike-medical', 'lindushealth', 'pearlhealth', 'springhealth', 'summerhealth',
    'alto', 'awellhealth', 'dandelionhealth', 'elationhealth', 'fountainlife',
    'hippocraticai', 'lumoshealth', 'oura', 'relationrx',
]

async function testAshby(slug: string) {
    try {
        const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) return { slug, status: 'error', code: res.status, total: 0, pmhnp: 0 }
        const data = await res.json()
        const jobs = data.jobs || []
        const total = jobs.length
        const pmhnp = jobs.filter((j: any) => {
            const text = `${j.title} ${j.descriptionHtml || ''}`.toLowerCase()
            return text.includes('pmhnp') || text.includes('psychiatric') || text.includes('mental health nurse')
        }).length
        return { slug, status: 'ok', code: 200, total, pmhnp }
    } catch { return { slug, status: 'timeout', code: 0, total: 0, pmhnp: 0 } }
}

// ─── BAMBOOHR ───
const BAMBOO_SLUGS = [
    'benchmarktherapy', 'employhealth', 'integratedmedicalservices',
    'wellkept', 'mapleheightsbehavioralhealth', 'cbhccolorado',
    'mindfulhealthsolutions', 'axishealthsystem', 'tetrahealth',
    'minneolahealth', '21stcenturyrehab', 'clinicaromero',
    'helloavahealth', 'jsashealthcare', 'monroehealthcenter',
    'geisheker', 'sagerecovery', 'spiritcommunityhealth', 'tulsaboyshome',
    'ivincihealth', 'mosesbhcare', 'muensterhospital', 'privatemedical',
    'saferidehealth', 'salinahealth', 'spirithealth', 'therapeuticsinc',
    'truecareny', 'vuehealth', 'wildernessmedicalstaffing', 'woundcareadvantage',
]

async function testBamboo(slug: string) {
    try {
        const res = await fetch(`https://${slug}.bamboohr.com/careers/list`, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) return { slug, status: 'error', code: res.status, total: 0, pmhnp: 0 }
        const data = await res.json()
        const jobs = data.result || []
        const total = Array.isArray(jobs) ? jobs.length : 0
        const pmhnp = Array.isArray(jobs) ? jobs.filter((j: any) => {
            const text = `${j.jobOpeningName || ''}`.toLowerCase()
            return text.includes('pmhnp') || text.includes('psychiatric') || text.includes('mental health nurse') || text.includes('nurse practitioner')
        }).length : 0
        return { slug, status: 'ok', code: 200, total, pmhnp }
    } catch { return { slug, status: 'timeout', code: 0, total: 0, pmhnp: 0 } }
}

// ─── GREENHOUSE (sample first 30) ───
const GREENHOUSE_SAMPLE = [
    'lifestancehealth', 'talkiatry', 'includedhealth', 'geodehealth', 'mindpathhealth',
    'refreshmentalhealth', 'thriveworks', 'acadiahealthcare', 'eleanorhealth',
    'brightspringhealth', 'centene', 'guidewellsourcecareers', 'compasshealthbrands',
    'cvshealthcareers', 'uhg', 'onemedicalprimarycare', 'villagemd',
    'bicyclehealth', 'iristelehealth', 'signifyhealth', 'carbyne', 'nuvancehealth',
    'amnhealthcare', 'geisingerfoundation', 'elliemental', 'hopescalescareers',
    'unitedhealthgroup', 'kaiserp', 'summithealth', 'oakstreethealth',
]

async function testGreenhouse(slug: string) {
    try {
        const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) return { slug, status: 'error', code: res.status, total: 0, pmhnp: 0 }
        const data = await res.json()
        const jobs = data.jobs || []
        const total = jobs.length
        const pmhnp = jobs.filter((j: any) => {
            const text = `${j.title} ${j.content || ''}`.toLowerCase()
            return text.includes('pmhnp') || text.includes('psychiatric') || text.includes('mental health nurse')
        }).length
        return { slug, status: 'ok', code: 200, total, pmhnp }
    } catch { return { slug, status: 'timeout', code: 0, total: 0, pmhnp: 0 } }
}

async function auditPlatform(
    name: string,
    slugs: string[],
    testFn: (slug: string) => Promise<{ slug: string; status: string; code: number; total: number; pmhnp: number }>
) {
    log(`\n=== ${name} (${slugs.length} slugs) ===`)
    const results: any[] = []
    const BATCH = 5

    for (let i = 0; i < slugs.length; i += BATCH) {
        const batch = slugs.slice(i, i + BATCH)
        const batchResults = await Promise.allSettled(batch.map(s => testFn(s)))
        for (const r of batchResults) {
            if (r.status === 'fulfilled') results.push(r.value)
        }
        if (i + BATCH < slugs.length) await sleep(500)
    }

    const alive = results.filter(r => r.status === 'ok')
    const withJobs = alive.filter(r => r.total > 0)
    const withPmhnp = alive.filter(r => r.pmhnp > 0)
    const dead = results.filter(r => r.status !== 'ok')
    const totalPmhnp = withPmhnp.reduce((sum: number, r: any) => sum + r.pmhnp, 0)

    log(`  Alive: ${alive.length}/${slugs.length} | With any jobs: ${withJobs.length} | With PMHNP: ${withPmhnp.length} | Total PMHNP jobs: ${totalPmhnp}`)
    log(`  Dead/Error: ${dead.length}`)

    if (dead.length > 0) {
        log(`  Dead slugs: ${dead.map((d: any) => `${d.slug}(${d.status})`).join(', ')}`)
    }
    log(``)

    // Show PMHNP-active ones
    const sorted = withPmhnp.sort((a: any, b: any) => b.pmhnp - a.pmhnp)
    if (sorted.length > 0) {
        log(`  PMHNP-active employers:`)
        for (const r of sorted) {
            log(`    ${r.slug.padEnd(30)} ${r.pmhnp} PMHNP / ${r.total} total`)
        }
    }

    // Show alive but 0 PMHNP
    const aliveNoPmhnp = alive.filter(r => r.total > 0 && r.pmhnp === 0)
    if (aliveNoPmhnp.length > 0) {
        log(``)
        log(`  Alive but 0 PMHNP (${aliveNoPmhnp.length}):`)
        for (const r of aliveNoPmhnp.slice(0, 15)) {
            log(`    ${r.slug.padEnd(30)} 0 PMHNP / ${r.total} total`)
        }
        if (aliveNoPmhnp.length > 15) log(`    ... and ${aliveNoPmhnp.length - 15} more`)
    }

    return results
}

async function main() {
    log(`ATS SLUG AUDIT - ${new Date().toISOString().slice(0, 16)}`)
    log(`${'='.repeat(60)}`)

    await auditPlatform('LEVER', LEVER_SLUGS, testLever)
    await auditPlatform('ASHBY', ASHBY_SLUGS, testAshby)
    await auditPlatform('BAMBOOHR', BAMBOO_SLUGS, testBamboo)
    await auditPlatform('GREENHOUSE (sample 30)', GREENHOUSE_SAMPLE, testGreenhouse)

    fs.writeFileSync('scripts/slug-audit-report.txt', out.join('\n'), 'utf8')
    console.log('\nFull report at scripts/slug-audit-report.txt')
}

main().catch(e => { console.error(e); process.exit(1) })
