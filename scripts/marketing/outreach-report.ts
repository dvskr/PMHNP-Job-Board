/**
 * Read-only outreach report: what the people we emailed did on the site.
 *
 *   npx tsx scripts/marketing/outreach-report.ts [--log tmp/marketing/send-log.json]
 *
 * Email open and click tracking stay off in the sending tool (pixels and
 * rewritten links hurt inbox placement), so this is the only click and
 * conversion signal:
 *   1. clicks on the `/r/e<n>?r=<contact id>` links in the sequence emails
 *   2. accounts created on a contacted company's domain
 *   3. employer job posts from a contacted domain (contact email or quota domain)
 *
 * The send log (gitignored, never committed) lists every enrollment and stop
 * in order, with contact id, company and domain; this script reads contacted
 * domains and ids from it and prints matches only. It connects with
 * PROD_DATABASE_URL from .env.prod over TLS, refuses any other project, and
 * runs inside a READ ONLY transaction. All times are UTC.
 */
import { readFileSync } from 'node:fs'
import { config as dotenvConfig } from 'dotenv'
import pg from 'pg'

const PROD_PROJECT_REF = 'sggccmqjzuimwlahocmy'
const DEV_PROJECT_REF = 'zdmpmncrcpgpmwdqvekg'
const DEFAULT_LOG = 'tmp/marketing/send-log.json'
// Mail security scanners open every link in a message within seconds of
// delivery, often for several recipients from one address.
const SCANNER_BURST_MS = 60_000

// created_at columns are `timestamp without time zone` holding UTC. By
// default node-postgres reads them as local time; read them as UTC instead.
const TIMESTAMP_WITHOUT_TZ_OID = 1114
pg.types.setTypeParser(TIMESTAMP_WITHOUT_TZ_OID, (value: string) => new Date(`${value.replace(' ', 'T')}Z`))

interface LoggedContact {
  readonly id: string
  readonly company: string
  readonly domain?: string
}

interface SendLogEvent {
  readonly at: string
  readonly action: string
  readonly contacts: readonly LoggedContact[]
}

interface SendLog {
  readonly events: readonly SendLogEvent[]
}

interface Contacted {
  readonly contacts: ReadonlyMap<string, LoggedContact>
  /** domain -> company and the time its first contact was enrolled */
  readonly domains: ReadonlyMap<string, { readonly company: string; readonly firstEnrolled: Date }>
  readonly since: Date
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/**
 * Replays the log in order: an enrollment adds a contact, a stop before the
 * first email removes it (that person never heard from us). Contacts
 * stopped later stay, because they did receive mail.
 */
export function contactedFromLog(log: SendLog): Contacted {
  const active = new Map<string, { contact: LoggedContact; enrolledAt: Date }>()
  const events = [...log.events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  for (const e of events) {
    for (const c of e.contacts) {
      if (e.action === 'enrolled') active.set(c.id, { contact: c, enrolledAt: new Date(e.at) })
      else if (e.action.startsWith('stopped before')) active.delete(c.id)
    }
  }
  if (active.size === 0) throw new Error('send log has no contact who was actually emailed')

  const domains = new Map<string, { company: string; firstEnrolled: Date }>()
  for (const { contact, enrolledAt } of active.values()) {
    if (!contact.domain) continue
    const key = contact.domain.toLowerCase()
    const seen = domains.get(key)
    if (!seen || enrolledAt < seen.firstEnrolled) domains.set(key, { company: contact.company, firstEnrolled: enrolledAt })
  }
  const since = new Date(Math.min(...[...active.values()].map((a) => a.enrolledAt.getTime())))
  return { contacts: new Map([...active].map(([id, a]) => [id, a.contact])), domains, since }
}

function assertProd(connectionString: string): void {
  const user = decodeURIComponent(new URL(connectionString).username)
  if (user.includes(DEV_PROJECT_REF) || !user.includes(PROD_PROJECT_REF)) {
    throw new Error('refusing to run: PROD_DATABASE_URL does not point at the prod project')
  }
}

const utc = (d: Date): string => `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`

async function main(): Promise<void> {
  dotenvConfig({ path: '.env.prod' })
  const url = process.env.PROD_DATABASE_URL
  if (!url) throw new Error('PROD_DATABASE_URL is not set (.env.prod)')
  assertProd(url)

  const { contacts, domains, since } = contactedFromLog(
    JSON.parse(readFileSync(argValue('--log') ?? DEFAULT_LOG, 'utf8')) as SendLog,
  )
  const domainList = [...domains.keys()]

  // Encrypted, matching scripts/prod-audit.js. The pooler's certificate is
  // not in Node's default CA store, so it is not verified here.
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    await client.query('BEGIN READ ONLY')

    const clicks = await client.query<{
      recipient_lead_id: string | null
      content: string
      is_bot: boolean
      ip_hash: string | null
      created_at: Date
    }>(
      `SELECT recipient_lead_id, content, is_bot, ip_hash, created_at
         FROM shortlink_clicks
        WHERE platform = 'email' AND created_at >= ($1::timestamptz AT TIME ZONE 'UTC')
        ORDER BY created_at`,
      [since.toISOString()],
    )

    const accounts = await client.query<{ domain: string; role: string; created_at: Date }>(
      `SELECT lower(split_part(email, '@', 2)) AS domain, role, created_at
         FROM user_profiles
        WHERE lower(split_part(email, '@', 2)) = ANY($1::text[])
        ORDER BY created_at`,
      [domainList],
    )

    const posts = await client.query<{ domain: string; payment_status: string; created_at: Date }>(
      `SELECT CASE WHEN lower(split_part(contact_email, '@', 2)) = ANY($1::text[])
                   THEN lower(split_part(contact_email, '@', 2))
                   ELSE lower(quota_domain) END AS domain,
              payment_status, created_at
         FROM employer_jobs
        WHERE lower(split_part(contact_email, '@', 2)) = ANY($1::text[])
           OR lower(quota_domain) = ANY($1::text[])
        ORDER BY created_at`,
      [domainList],
    )

    await client.query('COMMIT')

    const who = (id: string | null): string =>
      (id && contacts.get(id)?.company) || (id ? `unknown recipient ${id}` : 'no recipient id')
    const burst = (i: number): boolean => {
      const r = clicks.rows[i]
      if (!r.ip_hash) return false
      return clicks.rows.some(
        (o, j) =>
          j !== i &&
          o.ip_hash === r.ip_hash &&
          o.recipient_lead_id !== r.recipient_lead_id &&
          Math.abs(o.created_at.getTime() - r.created_at.getTime()) <= SCANNER_BURST_MS,
      )
    }
    const clickLabel = (i: number): string => {
      if (clicks.rows[i].is_bot) return 'bot            '
      return burst(i) ? 'likely scanner ' : 'not flagged    '
    }
    const newness = (domain: string, at: Date): string => {
      const first = domains.get(domain)?.firstEnrolled
      return first && at >= first ? 'NEW since first email' : 'existed before outreach'
    }

    console.log(`Outreach report since ${utc(since)}: ${contacts.size} contacts emailed, ${domainList.length} domains`)
    const unflagged = clicks.rows.filter((r, i) => !r.is_bot && !burst(i)).length
    console.log(`\nEmail link clicks: ${clicks.rows.length} total, ${unflagged} not flagged as bots or scanners`)
    console.log('  (a click within a minute or so of delivery can still be a mail scanner)')
    clicks.rows.forEach((r, i) => {
      console.log(`  ${utc(r.created_at)}  ${clickLabel(i)} ${r.content.padEnd(24)} ${who(r.recipient_lead_id)}`)
    })

    console.log(`\nAccounts on contacted domains: ${accounts.rows.length}`)
    for (const r of accounts.rows) {
      const company = domains.get(r.domain)?.company ?? r.domain
      console.log(`  ${utc(r.created_at)}  ${r.role.padEnd(10)} ${company}  (${newness(r.domain, r.created_at)})`)
    }
    console.log(`\nEmployer posts from contacted domains: ${posts.rows.length}`)
    for (const r of posts.rows) {
      const company = domains.get(r.domain)?.company ?? r.domain
      console.log(`  ${utc(r.created_at)}  ${r.payment_status.padEnd(10)} ${company}  (${newness(r.domain, r.created_at)})`)
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    await client.end()
  }
}

if (process.argv[1] && /outreach-report\.ts$/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
