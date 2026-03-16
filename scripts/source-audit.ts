import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import * as fs from 'fs'

dotenv.config({ path: '.env.local' })

const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL })

const out: string[] = []
function log(s: string) { out.push(s) }

async function main() {
  const client = await pool.connect()

  const totalRes = await client.query(`SELECT count(*) as cnt FROM jobs WHERE is_published = true`)
  const total = parseInt(totalRes.rows[0].cnt)
  log(`TOTAL ACTIVE JOBS: ${total}`)
  log(``)

  // Jobs by source_provider (the ATS/aggregator)
  const sourceAll = await client.query(`SELECT source_provider, count(*) as cnt FROM jobs WHERE is_published = true GROUP BY source_provider ORDER BY cnt DESC`)
  log(`=== JOBS BY SOURCE PROVIDER (all active) ===`)
  for (const r of sourceAll.rows) {
    const pct = ((parseInt(r.cnt) / total) * 100).toFixed(1)
    log(`  ${(r.source_provider || 'null').padEnd(22)} ${String(r.cnt).padStart(6)} jobs  (${pct}%)`)
  }
  log(``)

  // Last 7 days by source_provider
  const source7 = await client.query(`SELECT source_provider, count(*) as cnt FROM jobs WHERE is_published = true AND created_at > NOW() - INTERVAL '7 days' GROUP BY source_provider ORDER BY cnt DESC`)
  const total7 = source7.rows.reduce((s: number, r: any) => s + parseInt(r.cnt), 0)
  log(`=== JOBS ADDED LAST 7 DAYS (${total7} total) ===`)
  for (const r of source7.rows) {
    const pct = ((parseInt(r.cnt) / total7) * 100).toFixed(1)
    log(`  ${(r.source_provider || 'null').padEnd(22)} ${String(r.cnt).padStart(6)} jobs  (${pct}%)`)
  }
  log(``)

  // Last 24 hours
  const source24h = await client.query(`SELECT source_provider, count(*) as cnt FROM jobs WHERE is_published = true AND created_at > NOW() - INTERVAL '24 hours' GROUP BY source_provider ORDER BY cnt DESC`)
  const total24 = source24h.rows.reduce((s: number, r: any) => s + parseInt(r.cnt), 0)
  log(`=== JOBS ADDED LAST 24 HOURS (${total24} total) ===`)
  for (const r of source24h.rows) {
    const pct = ((parseInt(r.cnt) / total24) * 100).toFixed(1)
    log(`  ${(r.source_provider || 'null').padEnd(22)} ${String(r.cnt).padStart(6)} jobs  (${pct}%)`)
  }
  log(``)

  // Top employers (7 days)
  const topEmp = await client.query(`SELECT employer, source_provider, count(*) as cnt FROM jobs WHERE is_published = true AND created_at > NOW() - INTERVAL '7 days' GROUP BY employer, source_provider ORDER BY cnt DESC LIMIT 30`)
  log(`=== TOP 30 EMPLOYERS (last 7 days) ===`)
  for (const r of topEmp.rows) {
    log(`  ${(r.employer || 'unknown').padEnd(38)} ${String(r.cnt).padStart(4)} jobs  via ${r.source_provider || 'null'}`)
  }
  log(``)

  // Unique employers per source
  const uniqEmp = await client.query(`SELECT source_provider, count(DISTINCT employer) as emp_count, count(*) as job_count FROM jobs WHERE is_published = true GROUP BY source_provider ORDER BY job_count DESC`)
  log(`=== UNIQUE EMPLOYERS PER SOURCE ===`)
  for (const r of uniqEmp.rows) {
    log(`  ${(r.source_provider || 'null').padEnd(22)} ${String(r.emp_count).padStart(5)} employers  ${String(r.job_count).padStart(6)} jobs`)
  }

  client.release()
  await pool.end()

  fs.writeFileSync('scripts/source-report.txt', out.join('\n'), 'utf8')
  console.log('Done! Report at scripts/source-report.txt')
}

main().catch(e => { console.error(e); process.exit(1) })
