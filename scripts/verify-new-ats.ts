/**
 * Verify all 11 new ATS slugs are alive and returning PMHNP jobs
 */
import * as fs from 'fs'

const out: string[] = []
function log(s: string) { out.push(s); console.log(s) }

async function testSmartRecruiters() {
    log('=== SMARTRECRUITERS ===')
    const slugs = [
        'karecruitinginc',
        'oleskyassociates',
        'newyorkpsychotherapyandcounselingcenter',
        'internationalsosgovernmentmedicalservices',
        'kittitasvalleyhealthcare',
        'mascmedicalrecruitmentfirm',
    ]

    for (const slug of slugs) {
        try {
            const url = `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=10`
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
            if (!res.ok) {
                log(`  ${slug}: HTTP ${res.status} — DEAD`)
                continue
            }
            const data = await res.json() as any
            const jobs = data.content || []
            const pmhnp = jobs.filter((j: any) => {
                const text = `${j.name || ''} ${j.department?.label || ''}`.toLowerCase()
                return text.includes('pmhnp') || text.includes('psychiatric') || text.includes('mental health') || text.includes('nurse practitioner')
            })
            log(`  ${slug}: ${res.status} OK — ${data.totalFound || jobs.length} total jobs, ${pmhnp.length} PMHNP in sample`)
        } catch (e: any) {
            log(`  ${slug}: FAILED — ${e.message || e}`)
        }
    }
}

async function testICIMS() {
    log('\n=== ICIMS ===')
    // iCIMS URLs from DB:
    // careers2-universalhealthservices.icims.com
    // facilityjobs-acadiahealthcare.icims.com
    // careers-vhchealth.icims.com
    const slugs = [
        { slug: 'careers2-universalhealthservices', name: 'Universal Health Services' },
        { slug: 'facilityjobs-acadiahealthcare', name: 'Acadia Healthcare' },
        { slug: 'careers-vhchealth', name: 'VHC Health' },
    ]

    for (const co of slugs) {
        try {
            // iCIMS uses a search endpoint
            const url = `https://${co.slug}.icims.com/jobs/search?ss=1&searchKeyword=psychiatric+nurse+practitioner&mobile=false&width=1000&height=500&bga=true&needs498=false&t=1`
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
            log(`  ${co.slug}: HTTP ${res.status} — ${res.ok ? 'ALIVE' : 'DEAD'} (${co.name})`)
            if (res.ok) {
                const html = await res.text()
                // Count job listings in the HTML
                const jobMatches = html.match(/class="iCIMS_JobTitle/gi)
                log(`    → ${jobMatches?.length || 0} job titles found in HTML`)
            }
        } catch (e: any) {
            log(`  ${co.slug}: FAILED — ${e.message || e}`)
        }
    }
}

async function testJazzHR() {
    log('\n=== JAZZ HR ===')
    // Jazz HR uses applytojob.com
    const slugs = [
        { slug: 'applewoodcenters', name: 'Applewood Centers' },
        { slug: 'mastercenterforaddictionmedicine', name: 'Master Center for Addiction Medicine' },
    ]

    for (const co of slugs) {
        try {
            // Jazz HR API endpoint
            const url = `https://app.jazz.co/widgets/basic/create/${co.slug}`
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
            log(`  ${co.slug}: HTTP ${res.status} — ${res.ok ? 'ALIVE' : 'DEAD'} (${co.name})`)
            if (res.ok) {
                const html = await res.text()
                const jobMatches = html.match(/class="resumator-job-title/gi) || html.match(/class="job-title/gi)
                log(`    → ${jobMatches?.length || 0} job titles found in HTML`)
                // Check for any PMHNP mention
                const hasPMHNP = html.toLowerCase().includes('pmhnp') || html.toLowerCase().includes('psychiatric') || html.toLowerCase().includes('nurse practitioner')
                log(`    → PMHNP content: ${hasPMHNP ? 'YES' : 'NO'}`)
            }
        } catch (e: any) {
            log(`  ${co.slug}: FAILED — ${e.message || e}`)
        }
    }

    // Also try the JSON API
    log('\n  --- Jazz HR JSON API test ---')
    for (const co of slugs) {
        try {
            const url = `https://app.jazz.co/api/jobs?board=${co.slug}`
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
            log(`  ${co.slug} (API): HTTP ${res.status}`)
            if (res.ok) {
                const text = await res.text()
                log(`    → Response length: ${text.length} chars`)
                try {
                    const data = JSON.parse(text)
                    log(`    → Jobs: ${Array.isArray(data) ? data.length : 'not an array'}`)
                } catch {
                    log(`    → Not JSON`)
                }
            }
        } catch (e: any) {
            log(`  ${co.slug} (API): FAILED — ${e.message || e}`)
        }
    }
}

async function main() {
    await testSmartRecruiters()
    await testICIMS()
    await testJazzHR()

    fs.writeFileSync('scripts/verify-new-ats.txt', out.join('\n'), 'utf8')
    log('\nFull report: scripts/verify-new-ats.txt')
}

main().catch(e => { console.error(e); process.exit(1) })
