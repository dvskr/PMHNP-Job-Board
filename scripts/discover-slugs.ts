/**
 * Mine production DB for new ATS slugs
 * 
 * Scans all apply_link URLs to find Greenhouse, Lever, Workday, Ashby,
 * and BambooHR career page patterns, then cross-references against
 * existing handler slug lists to find new employers.
 */
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import * as fs from 'fs'

dotenv.config({ path: '.env.local' })

const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL })

const out: string[] = []
function log(s: string) { out.push(s); console.log(s) }

// ATS URL patterns → slug extraction
const ATS_PATTERNS: Array<{
    name: string;
    regex: RegExp;
    extract: (match: RegExpMatchArray) => string;
}> = [
        {
            name: 'greenhouse',
            regex: /boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/i,
            extract: m => m[1].toLowerCase(),
        },
        {
            name: 'greenhouse-api',
            regex: /boards-api\.greenhouse\.io\/v1\/boards\/([a-zA-Z0-9_-]+)/i,
            extract: m => m[1].toLowerCase(),
        },
        {
            name: 'greenhouse-embed',
            regex: /job-boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/i,
            extract: m => m[1].toLowerCase(),
        },
        {
            name: 'lever',
            regex: /jobs\.lever\.co\/([a-zA-Z0-9._-]+)/i,
            extract: m => m[1].toLowerCase(),
        },
        {
            name: 'lever-api',
            regex: /api\.lever\.co\/v0\/postings\/([a-zA-Z0-9._-]+)/i,
            extract: m => m[1].toLowerCase(),
        },
        {
            name: 'workday',
            regex: /([a-zA-Z0-9_-]+)\.(?:wd[0-9]+\.)?myworkdayjobs\.com/i,
            extract: m => m[1].toLowerCase(),
        },
        {
            name: 'ashby',
            regex: /jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/i,
            extract: m => m[1].toLowerCase(),
        },
        {
            name: 'bamboohr',
            regex: /([a-zA-Z0-9_-]+)\.bamboohr\.com/i,
            extract: m => m[1].toLowerCase(),
        },
        {
            name: 'icims',
            regex: /([a-zA-Z0-9_-]+)\.icims\.com/i,
            extract: m => m[1].toLowerCase(),
        },
        {
            name: 'jobvite',
            regex: /jobs\.jobvite\.com\/([a-zA-Z0-9_-]+)/i,
            extract: m => m[1].toLowerCase(),
        },
        {
            name: 'smartrecruiters',
            regex: /jobs\.smartrecruiters\.com\/([a-zA-Z0-9._-]+)/i,
            extract: m => m[1].toLowerCase(),
        },
        {
            name: 'paylocity',
            regex: /recruiting\.paylocity\.com\/recruiting\/jobs\/All\/([a-zA-Z0-9._-]+)/i,
            extract: m => m[1].toLowerCase(),
        },
        {
            name: 'breezy',
            regex: /([a-zA-Z0-9_-]+)\.breezy\.hr/i,
            extract: m => m[1].toLowerCase(),
        },
        {
            name: 'jazz',
            regex: /([a-zA-Z0-9_-]+)\.applytojob\.com/i,
            extract: m => m[1].toLowerCase(),
        },
    ];

async function main() {
    const client = await pool.connect()

    // Get all unique apply_link URLs
    const res = await client.query(`
    SELECT apply_link, employer, source_provider
    FROM jobs 
    WHERE is_published = true AND apply_link IS NOT NULL AND apply_link != ''
  `)

    log(`TOTAL JOBS WITH APPLY LINKS: ${res.rows.length}`)
    log(``)

    // Parse each URL for ATS patterns
    const atsSlugs: Record<string, Map<string, Set<string>>> = {}
    let matched = 0

    for (const row of res.rows) {
        const url = row.apply_link
        for (const pattern of ATS_PATTERNS) {
            const match = url.match(pattern.regex)
            if (match) {
                const slug = pattern.extract(match)
                const atsName = pattern.name.replace(/-api$/, '').replace(/-embed$/, '')

                if (!atsSlugs[atsName]) atsSlugs[atsName] = new Map()
                if (!atsSlugs[atsName].has(slug)) atsSlugs[atsName].set(slug, new Set())
                atsSlugs[atsName].get(slug)!.add(row.employer)
                matched++
                break
            }
        }
    }

    log(`URLS MATCHED TO ATS: ${matched}`)
    log(``)

    // Report findings per ATS
    for (const [ats, slugMap] of Object.entries(atsSlugs)) {
        const sorted = [...slugMap.entries()].sort((a, b) => b[1].size - a[1].size)
        log(`=== ${ats.toUpperCase()} (${sorted.length} unique slugs) ===`)
        for (const [slug, employers] of sorted.slice(0, 50)) {
            const empList = [...employers].slice(0, 3).join(', ')
            const more = employers.size > 3 ? ` +${employers.size - 3} more` : ''
            log(`  ${slug.padEnd(40)} ${String(employers.size).padStart(3)} employers  (${empList}${more})`)
        }
        if (sorted.length > 50) log(`  ... and ${sorted.length - 50} more`)
        log(``)
    }

    // Now cross-reference against existing slugs
    log(`\n${'='.repeat(60)}`)
    log(`CROSS-REFERENCE: New slugs NOT in current handlers`)
    log(`${'='.repeat(60)}\n`)

    // Read current handler files
    const greenhouseFile = fs.readFileSync('lib/aggregators/greenhouse.ts', 'utf8')
    const leverFile = fs.readFileSync('lib/aggregators/lever.ts', 'utf8')
    const ashbyFile = fs.readFileSync('lib/aggregators/ashby.ts', 'utf8')
    const workdayFile = fs.readFileSync('lib/aggregators/workday.ts', 'utf8')

    const existingSlugs: Record<string, Set<string>> = {
        greenhouse: new Set(),
        lever: new Set(),
        ashby: new Set(),
        workday: new Set(),
    }

    // Extract existing greenhouse slugs
    const ghMatches = greenhouseFile.matchAll(/'([a-zA-Z0-9_-]+)'/g)
    for (const m of ghMatches) existingSlugs.greenhouse.add(m[1].toLowerCase())

    // Extract existing lever slugs
    const lvMatches = leverFile.matchAll(/'([a-zA-Z0-9._-]+)'/g)
    for (const m of lvMatches) existingSlugs.lever.add(m[1].toLowerCase())

    // Extract existing ashby slugs
    const asMatches = ashbyFile.matchAll(/slug:\s*"([a-zA-Z0-9_-]+)"/g)
    for (const m of asMatches) existingSlugs.ashby.add(m[1].toLowerCase())

    // Extract existing workday slugs  
    const wdMatches = workdayFile.matchAll(/slug:\s*'([a-zA-Z0-9_-]+)'/g)
    for (const m of wdMatches) existingSlugs.workday.add(m[1].toLowerCase())

    for (const ats of ['greenhouse', 'lever', 'ashby', 'workday']) {
        const slugMap = atsSlugs[ats]
        if (!slugMap) continue

        const newSlugs = [...slugMap.entries()]
            .filter(([slug]) => !existingSlugs[ats]?.has(slug))
            .sort((a, b) => b[1].size - a[1].size)

        log(`### NEW ${ats.toUpperCase()} SLUGS (${newSlugs.length} found, ${existingSlugs[ats]?.size || 0} already tracked) ###`)
        for (const [slug, employers] of newSlugs.slice(0, 40)) {
            const empList = [...employers].slice(0, 3).join(', ')
            log(`  ${slug.padEnd(40)} ${String(employers.size).padStart(3)} employers  (${empList})`)
        }
        if (newSlugs.length > 40) log(`  ... and ${newSlugs.length - 40} more`)
        log(``)
    }

    // Also report ATS platforms we don't currently scrape
    for (const ats of ['icims', 'jobvite', 'smartrecruiters', 'paylocity', 'breezy', 'jazz', 'bamboohr']) {
        const slugMap = atsSlugs[ats]
        if (!slugMap) continue

        const sorted = [...slugMap.entries()].sort((a, b) => b[1].size - a[1].size)
        log(`### ${ats.toUpperCase()} — NOT CURRENTLY SCRAPED (${sorted.length} slugs found) ###`)
        for (const [slug, employers] of sorted.slice(0, 20)) {
            const empList = [...employers].slice(0, 3).join(', ')
            log(`  ${slug.padEnd(40)} ${String(employers.size).padStart(3)} employers  (${empList})`)
        }
        if (sorted.length > 20) log(`  ... and ${sorted.length - 20} more`)
        log(``)
    }

    client.release()
    await pool.end()

    fs.writeFileSync('scripts/new-slugs-report.txt', out.join('\n'), 'utf8')
    console.log('\nFull report: scripts/new-slugs-report.txt')
}

main().catch(e => { console.error(e); process.exit(1) })
