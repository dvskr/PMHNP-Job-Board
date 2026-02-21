/**
 * FULL LIVE SLUG AUDIT
 * Tests every slug in Lever, Ashby, Workday, SmartRecruiters, iCIMS, JazzHR
 * For Greenhouse (789 slugs), tests a representative sample of 50
 */
import * as fs from 'fs'

const out: string[] = []
function log(s: string) { out.push(s); console.log(s) }

interface SlugResult {
    slug: string
    status: 'alive' | 'dead' | 'timeout' | 'error'
    totalJobs: number
    pmhnpJobs: number
    httpStatus?: number
    errorMsg?: string
}

function isPMHNP(text: string): boolean {
    const t = text.toLowerCase()
    return t.includes('pmhnp') || t.includes('psychiatric') ||
        t.includes('mental health nurse') || t.includes('psych np') ||
        t.includes('psychiatric nurse') || t.includes('behavioral health nurse')
}

// ============= LEVER =============
async function testLever(): Promise<SlugResult[]> {
    const slugs = fs.readFileSync('lib/aggregators/lever.ts', 'utf8')
    const matches = [...slugs.matchAll(/'([a-zA-Z0-9._-]+)'/g)]
        .map(m => m[1])
        .filter(s => !s.includes('//') && s.length > 2 && !['talkiatry', 'lifestance'].includes(s) ? true : true)

    // Get actual LEVER_COMPANIES array content
    const arrayMatch = slugs.match(/const LEVER_COMPANIES = \[([\s\S]*?)\]/)?.[1] || ''
    const leverSlugs = [...arrayMatch.matchAll(/'([a-zA-Z0-9._-]+)'/g)].map(m => m[1])

    log(`\n=== LEVER (${leverSlugs.length} slugs) ===`)
    const results: SlugResult[] = []

    for (const slug of leverSlugs) {
        try {
            const res = await fetch(`https://api.lever.co/v0/postings/${slug}`, { signal: AbortSignal.timeout(8000) })
            if (!res.ok) {
                results.push({ slug, status: 'dead', totalJobs: 0, pmhnpJobs: 0, httpStatus: res.status })
                log(`  ❌ ${slug}: HTTP ${res.status}`)
                continue
            }
            const jobs = await res.json() as any[]
            const pmhnp = jobs.filter((j: any) => isPMHNP(`${j.text} ${j.descriptionPlain || ''}`))
            results.push({ slug, status: 'alive', totalJobs: jobs.length, pmhnpJobs: pmhnp.length })
            log(`  ✅ ${slug}: ${jobs.length} jobs, ${pmhnp.length} PMHNP`)
        } catch (e: any) {
            const isTimeout = e.name === 'AbortError' || e.message?.includes('abort')
            results.push({ slug, status: isTimeout ? 'timeout' : 'error', totalJobs: 0, pmhnpJobs: 0, errorMsg: e.message })
            log(`  ⏰ ${slug}: ${isTimeout ? 'TIMEOUT' : e.message}`)
        }
    }
    return results
}

// ============= ASHBY =============
async function testAshby(): Promise<SlugResult[]> {
    const fileContent = fs.readFileSync('lib/aggregators/ashby.ts', 'utf8')
    const ashbySlugs = [...fileContent.matchAll(/slug:\s*"([^"]+)"/g)].map(m => m[1])

    log(`\n=== ASHBY (${ashbySlugs.length} slugs) ===`)
    const results: SlugResult[] = []

    for (const slug of ashbySlugs) {
        try {
            const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, { signal: AbortSignal.timeout(8000) })
            if (!res.ok) {
                results.push({ slug, status: 'dead', totalJobs: 0, pmhnpJobs: 0, httpStatus: res.status })
                log(`  ❌ ${slug}: HTTP ${res.status}`)
                continue
            }
            const data = await res.json() as any
            const jobs = data.jobs || []
            const pmhnp = jobs.filter((j: any) => isPMHNP(`${j.title} ${j.descriptionHtml || ''}`))
            results.push({ slug, status: 'alive', totalJobs: jobs.length, pmhnpJobs: pmhnp.length })
            log(`  ✅ ${slug}: ${jobs.length} jobs, ${pmhnp.length} PMHNP`)
        } catch (e: any) {
            const isTimeout = e.name === 'AbortError' || e.message?.includes('abort')
            results.push({ slug, status: isTimeout ? 'timeout' : 'error', totalJobs: 0, pmhnpJobs: 0, errorMsg: e.message })
            log(`  ⏰ ${slug}: ${isTimeout ? 'TIMEOUT' : e.message}`)
        }
    }
    return results
}

// ============= WORKDAY =============
async function testWorkday(): Promise<SlugResult[]> {
    const fileContent = fs.readFileSync('lib/aggregators/workday.ts', 'utf8')
    const companies = [...fileContent.matchAll(/\{\s*slug:\s*'([^']+)'\s*,\s*instance:\s*(\d+)\s*,\s*site:\s*'([^']+)'\s*,\s*name:\s*'([^']+)'/g)]
        .map(m => ({ slug: m[1], instance: parseInt(m[2]), site: m[3], name: m[4] }))

    log(`\n=== WORKDAY (${companies.length} slugs) ===`)
    const results: SlugResult[] = []

    for (const co of companies) {
        try {
            const url = `https://${co.slug}.wd${co.instance}.myworkdayjobs.com/wday/cxs/${co.slug}/${co.site}/jobs`
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ limit: 5, offset: 0, searchText: '' }),
                signal: AbortSignal.timeout(10000),
            })
            if (!res.ok) {
                results.push({ slug: co.slug, status: 'dead', totalJobs: 0, pmhnpJobs: 0, httpStatus: res.status })
                log(`  ❌ ${co.slug} (wd${co.instance}/${co.site}): HTTP ${res.status}`)
                continue
            }
            const data = await res.json() as any
            const total = data.total || 0
            // Can't easily check PMHNP from the list endpoint, so just report total
            results.push({ slug: co.slug, status: 'alive', totalJobs: total, pmhnpJobs: -1 })
            log(`  ✅ ${co.slug}: ${total} total jobs`)
        } catch (e: any) {
            const isTimeout = e.name === 'AbortError' || e.message?.includes('abort')
            results.push({ slug: co.slug, status: isTimeout ? 'timeout' : 'error', totalJobs: 0, pmhnpJobs: 0, errorMsg: e.message })
            log(`  ⏰ ${co.slug}: ${isTimeout ? 'TIMEOUT' : e.message}`)
        }
    }
    return results
}

// ============= GREENHOUSE (SAMPLE) =============
async function testGreenhouseSample(): Promise<SlugResult[]> {
    const fileContent = fs.readFileSync('lib/aggregators/greenhouse.ts', 'utf8')
    const arrayMatch = fileContent.match(/const GREENHOUSE_COMPANIES[^=]*=\s*\[([\s\S]*?)\]/)?.[1] || ''
    const allSlugs = [...arrayMatch.matchAll(/'([a-zA-Z0-9_-]+)'/g)].map(m => m[1])

    // Sample: first 20, last 20, and 20 random from middle
    const sample = [
        ...allSlugs.slice(0, 20),
        ...allSlugs.slice(-20),
        ...allSlugs.filter((_, i) => i >= 20 && i < allSlugs.length - 20).sort(() => Math.random() - 0.5).slice(0, 20)
    ]
    const unique = [...new Set(sample)]

    log(`\n=== GREENHOUSE (sample ${unique.length} of ${allSlugs.length} slugs) ===`)
    const results: SlugResult[] = []

    for (const slug of unique) {
        try {
            const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, { signal: AbortSignal.timeout(8000) })
            if (!res.ok) {
                results.push({ slug, status: 'dead', totalJobs: 0, pmhnpJobs: 0, httpStatus: res.status })
                log(`  ❌ ${slug}: HTTP ${res.status}`)
                continue
            }
            const data = await res.json() as any
            const jobs = data.jobs || []
            const pmhnp = jobs.filter((j: any) => isPMHNP(`${j.title} ${j.content || ''}`))
            results.push({ slug, status: 'alive', totalJobs: jobs.length, pmhnpJobs: pmhnp.length })
            if (pmhnp.length > 0) {
                log(`  ✅ ${slug}: ${jobs.length} jobs, ${pmhnp.length} PMHNP ⭐`)
            } else {
                log(`  ✅ ${slug}: ${jobs.length} jobs, 0 PMHNP`)
            }
        } catch (e: any) {
            const isTimeout = e.name === 'AbortError' || e.message?.includes('abort')
            results.push({ slug, status: isTimeout ? 'timeout' : 'error', totalJobs: 0, pmhnpJobs: 0, errorMsg: e.message })
            log(`  ⏰ ${slug}: ${isTimeout ? 'TIMEOUT' : e.message}`)
        }
    }
    return results
}

// ============= SMARTRECRUITERS =============
async function testSmartRecruiters(): Promise<SlugResult[]> {
    const fileContent = fs.readFileSync('lib/aggregators/smartrecruiters.ts', 'utf8')
    const slugs = [...fileContent.matchAll(/slug:\s*'([^']+)'/g)].map(m => m[1])

    log(`\n=== SMARTRECRUITERS (${slugs.length} slugs) ===`)
    const results: SlugResult[] = []

    for (const slug of slugs) {
        try {
            const res = await fetch(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=10`, { signal: AbortSignal.timeout(8000) })
            if (!res.ok) {
                results.push({ slug, status: 'dead', totalJobs: 0, pmhnpJobs: 0, httpStatus: res.status })
                log(`  ❌ ${slug}: HTTP ${res.status}`)
                continue
            }
            const data = await res.json() as any
            const jobs = data.content || []
            const total = data.totalFound || jobs.length
            const pmhnp = jobs.filter((j: any) => isPMHNP(j.name || ''))
            results.push({ slug, status: 'alive', totalJobs: total, pmhnpJobs: pmhnp.length })
            log(`  ✅ ${slug}: ${total} total jobs, ${pmhnp.length} PMHNP in sample`)
        } catch (e: any) {
            const isTimeout = e.name === 'AbortError' || e.message?.includes('abort')
            results.push({ slug, status: isTimeout ? 'timeout' : 'error', totalJobs: 0, pmhnpJobs: 0, errorMsg: e.message })
            log(`  ⏰ ${slug}: ${isTimeout ? 'TIMEOUT' : e.message}`)
        }
    }
    return results
}

// ============= ICIMS =============
async function testICIMS(): Promise<SlugResult[]> {
    const fileContent = fs.readFileSync('lib/aggregators/icims.ts', 'utf8')
    const slugs = [...fileContent.matchAll(/slug:\s*'([^']+)'/g)].map(m => m[1])

    log(`\n=== ICIMS (${slugs.length} slugs) ===`)
    const results: SlugResult[] = []

    for (const slug of slugs) {
        try {
            const url = `https://${slug}.icims.com/jobs/search?ss=1&searchKeyword=psychiatric+nurse+practitioner&in_iframe=1`
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
            if (!res.ok) {
                results.push({ slug, status: 'dead', totalJobs: 0, pmhnpJobs: 0, httpStatus: res.status })
                log(`  ❌ ${slug}: HTTP ${res.status}`)
                continue
            }
            const html = await res.text()
            const jobLinks = (html.match(/\/jobs\/\d+/g) || []).length
            results.push({ slug, status: 'alive', totalJobs: jobLinks, pmhnpJobs: -1 })
            log(`  ✅ ${slug}: ${jobLinks} job links found`)
        } catch (e: any) {
            const isTimeout = e.name === 'AbortError' || e.message?.includes('abort')
            results.push({ slug, status: isTimeout ? 'timeout' : 'error', totalJobs: 0, pmhnpJobs: 0, errorMsg: e.message })
            log(`  ⏰ ${slug}: ${isTimeout ? 'TIMEOUT' : e.message}`)
        }
    }
    return results
}

// ============= JAZZHR =============
async function testJazzHR(): Promise<SlugResult[]> {
    const fileContent = fs.readFileSync('lib/aggregators/jazzhr.ts', 'utf8')
    const slugs = [...fileContent.matchAll(/slug:\s*'([^']+)'/g)].map(m => m[1])

    log(`\n=== JAZZHR (${slugs.length} slugs) ===`)
    const results: SlugResult[] = []

    for (const slug of slugs) {
        try {
            const url = `https://app.jazz.co/widgets/basic/create/${slug}`
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
            if (!res.ok) {
                results.push({ slug, status: 'dead', totalJobs: 0, pmhnpJobs: 0, httpStatus: res.status })
                log(`  ❌ ${slug}: HTTP ${res.status}`)
                continue
            }
            const html = await res.text()
            const hasPMHNP = isPMHNP(html)
            const jobTitles = (html.match(/class="resumator-job/gi) || []).length
            results.push({ slug, status: 'alive', totalJobs: jobTitles, pmhnpJobs: hasPMHNP ? 1 : 0 })
            log(`  ✅ ${slug}: ${jobTitles} job entries, PMHNP: ${hasPMHNP ? 'YES' : 'NO'}`)
        } catch (e: any) {
            const isTimeout = e.name === 'AbortError' || e.message?.includes('abort')
            results.push({ slug, status: isTimeout ? 'timeout' : 'error', totalJobs: 0, pmhnpJobs: 0, errorMsg: e.message })
            log(`  ⏰ ${slug}: ${isTimeout ? 'TIMEOUT' : e.message}`)
        }
    }
    return results
}

// ============= MAIN =============
async function main() {
    log('FULL LIVE SLUG AUDIT — ' + new Date().toISOString())
    log('='.repeat(60))

    const allResults: Record<string, SlugResult[]> = {}

    // Test smaller handlers first (fast), then Greenhouse sample
    allResults.lever = await testLever()
    allResults.ashby = await testAshby()
    allResults.smartrecruiters = await testSmartRecruiters()
    allResults.icims = await testICIMS()
    allResults.jazzhr = await testJazzHR()
    allResults.workday = await testWorkday()
    allResults.greenhouse = await testGreenhouseSample()

    // SUMMARY
    log('\n' + '='.repeat(60))
    log('SUMMARY')
    log('='.repeat(60))

    for (const [ats, results] of Object.entries(allResults)) {
        const alive = results.filter(r => r.status === 'alive')
        const dead = results.filter(r => r.status === 'dead')
        const timeout = results.filter(r => r.status === 'timeout')
        const err = results.filter(r => r.status === 'error')

        log(`\n${ats.toUpperCase()} (${results.length} tested):`)
        log(`  ✅ Alive: ${alive.length}`)
        if (dead.length > 0) log(`  ❌ Dead: ${dead.length} → ${dead.map(r => r.slug).join(', ')}`)
        if (timeout.length > 0) log(`  ⏰ Timeout: ${timeout.length} → ${timeout.map(r => r.slug).join(', ')}`)
        if (err.length > 0) log(`  💥 Error: ${err.length} → ${err.map(r => r.slug).join(', ')}`)

        const withPMHNP = alive.filter(r => r.pmhnpJobs > 0)
        if (withPMHNP.length > 0) {
            log(`  ⭐ With PMHNP jobs: ${withPMHNP.length} → ${withPMHNP.map(r => `${r.slug}(${r.pmhnpJobs})`).join(', ')}`)
        }
    }

    fs.writeFileSync('scripts/full-audit-report.txt', out.join('\n'), 'utf8')
    log('\nFull report: scripts/full-audit-report.txt')
}

main().catch(e => { console.error(e); process.exit(1) })
