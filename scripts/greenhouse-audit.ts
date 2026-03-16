/**
 * GREENHOUSE FULL AUDIT — test all 772 slugs
 * Uses HEAD requests for speed, then GET for any that return 200 to count jobs
 */
import * as fs from 'fs'

const fileContent = fs.readFileSync('lib/aggregators/greenhouse.ts', 'utf8')
const arrayMatch = fileContent.match(/const GREENHOUSE_COMPANIES[^=]*=\s*\[([\s\S]*?)\]/)?.[1] || ''
const allSlugs = [...arrayMatch.matchAll(/'([a-zA-Z0-9_-]+)'/g)].map(m => m[1])

console.log(`Testing ${allSlugs.length} Greenhouse slugs...`)

const dead: string[] = []
const timeout: string[] = []
const alive: string[] = []
const zeroJobs: string[] = []
const BATCH = 20

async function testSlug(slug: string): Promise<void> {
    try {
        const res = await fetch(
            `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
            { signal: AbortSignal.timeout(6000) }
        )
        if (!res.ok) {
            dead.push(slug)
            return
        }
        const data = await res.json() as any
        const count = data.jobs?.length ?? 0
        if (count === 0) {
            zeroJobs.push(slug)
        }
        alive.push(slug)
    } catch (e: any) {
        if (e.name === 'AbortError' || e.message?.includes('abort')) {
            timeout.push(slug)
        } else {
            dead.push(`${slug} (${e.message})`)
        }
    }
}

async function main() {
    for (let i = 0; i < allSlugs.length; i += BATCH) {
        const batch = allSlugs.slice(i, i + BATCH)
        await Promise.allSettled(batch.map(s => testSlug(s)))
        if (i % 100 === 0) {
            console.log(`  Progress: ${i}/${allSlugs.length} (${dead.length} dead so far)`)
        }
    }

    console.log(`\n=== GREENHOUSE FULL AUDIT ===`)
    console.log(`Total: ${allSlugs.length}`)
    console.log(`Alive: ${alive.length}`)
    console.log(`Dead: ${dead.length}`)
    console.log(`Timeout: ${timeout.length}`)
    console.log(`Zero jobs (alive but empty): ${zeroJobs.length}`)

    if (dead.length > 0) {
        console.log(`\nDead slugs:`)
        dead.forEach(s => console.log(`  - ${s}`))
    }

    fs.writeFileSync('scripts/greenhouse-dead-slugs.txt', dead.join('\n'), 'utf8')
    console.log(`\nDead slugs written to scripts/greenhouse-dead-slugs.txt`)
}

main().catch(e => { console.error(e); process.exit(1) })
