import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
dotenv.config({ path: '.env.local' })

const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL })

async function main() {
    const client = await pool.connect()
    const out: string[] = []

    const slugs = ['rogersbh', 'tamus', 'saintlukes', 'brightli', 'thriveworks']

    for (const slug of slugs) {
        const res = await client.query(
            `SELECT apply_link, employer FROM jobs WHERE apply_link LIKE $1 AND is_published = true LIMIT 3`,
            [`%${slug}%workday%`]
        )
        out.push(`\n${slug} (${res.rows.length} hits):`)
        for (const r of res.rows) out.push(`  ${r.employer}: ${r.apply_link.substring(0, 120)}`)
    }

    // Also get Fort Health
    const fort = await client.query(
        `SELECT apply_link, employer FROM jobs WHERE employer ILIKE '%fort health%' AND is_published = true LIMIT 3`
    )
    out.push(`\nfort health (${fort.rows.length} hits):`)
    for (const r of fort.rows) out.push(`  ${r.employer}: ${r.apply_link.substring(0, 120)}`)

    fs.writeFileSync('scripts/workday-urls.txt', out.join('\n'), 'utf8')
    console.log('Done: scripts/workday-urls.txt')

    client.release()
    await pool.end()
}

main()
