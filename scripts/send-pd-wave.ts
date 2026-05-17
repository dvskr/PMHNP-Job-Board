/**
 * send-pd-wave.ts
 * ────────────────────────────────────────────────────────────────────
 * Send a Program Directors campaign wave: pulls leads from
 * `program_director_leads`, resolves Mustache-style `{{merge_tags}}`
 * against each lead, fires via Resend through `sendAndLog`, and updates
 * the lead's `outreach_status` + `last_contacted_at`.
 *
 * Defaults to --dry-run. You must pass --execute to actually send.
 *
 *   # Preview the Wave 1 Touch 1 send to all Tier 1 PDs
 *   npx tsx scripts/send-pd-wave.ts --wave=1 --touch=1
 *
 *   # Smoke test: send the email to your own inbox only
 *   npx tsx scripts/send-pd-wave.ts --wave=1 --touch=1 --execute \
 *     --to=daggulasatish143@gmail.com --max=1
 *
 *   # Real Wave 1 send, capped at 25 (good first-day cadence)
 *   npx tsx scripts/send-pd-wave.ts --wave=1 --touch=1 --execute --max=25
 *
 *   # Wave 1 Touch 2 (day-5 follow-up to non-responders)
 *   npx tsx scripts/send-pd-wave.ts --wave=1 --touch=2 --execute --max=25
 *
 * Flags:
 *   --wave=1|2     Wave 1 = Tier 1 PDs, Wave 2 = Tier 2 + Tier 3
 *   --touch=1|2    Touch 1 = initial cold email, Touch 2 = day-5 follow-up
 *                  (Touch 3 is a LinkedIn DM, sent manually — not scriptable)
 *   --execute      Actually send (default is dry-run)
 *   --to=<email>   Override every recipient with this address (smoke test)
 *   --max=N        Hard cap on sends in this invocation (default 50)
 *
 * Throttling: sleeps 1500ms between sends to stay under Resend's 10/s
 * rate limit and avoid Gmail's bulk-send heuristics.
 *
 * See docs/runbooks/program-directors-campaign.md §5 (Outreach
 * sequence) and §6 (Email & DM copy) for the campaign motion.
 */
import { config as dotenvConfig } from 'dotenv'
dotenvConfig({ path: '.env.local' })
dotenvConfig({ path: '.env' })
dotenvConfig({ path: '.env.prod' })

// Dynamic imports so dotenv runs first.
type PrismaModule = typeof import('@/lib/prisma')
type EmailServiceModule = typeof import('@/lib/email-service')

let prismaCache: PrismaModule['prisma'] | null = null
async function getPrisma() {
  if (!prismaCache) prismaCache = (await import('@/lib/prisma')).prisma
  return prismaCache
}
let emailServiceCache: EmailServiceModule | null = null
async function getEmailService(): Promise<EmailServiceModule> {
  if (!emailServiceCache) emailServiceCache = await import('@/lib/email-service')
  return emailServiceCache
}

// ─── Flags ──────────────────────────────────────────────────────────
interface Flags {
  readonly wave: 1 | 2
  readonly touch: 1 | 2
  readonly execute: boolean
  readonly to: string | null
  readonly max: number
}

function parseFlags(): Flags {
  const args = process.argv.slice(2)
  const getFlag = (name: string): string | null => {
    const prefix = `--${name}=`
    const match = args.find((a) => a.startsWith(prefix))
    return match ? match.slice(prefix.length) : null
  }
  const has = (name: string): boolean => args.includes(`--${name}`)

  const wave = Number(getFlag('wave') ?? '1')
  const touch = Number(getFlag('touch') ?? '1')
  if (wave !== 1 && wave !== 2) {
    console.error('[send-pd-wave] --wave must be 1 or 2')
    process.exit(1)
  }
  if (touch !== 1 && touch !== 2) {
    console.error('[send-pd-wave] --touch must be 1 or 2 (Touch 3 is a LinkedIn DM, send manually)')
    process.exit(1)
  }
  const max = Number(getFlag('max') ?? '50')
  if (!Number.isInteger(max) || max < 1 || max > 200) {
    console.error('[send-pd-wave] --max must be an integer between 1 and 200')
    process.exit(1)
  }
  return {
    wave: wave as 1 | 2,
    touch: touch as 1 | 2,
    execute: has('execute'),
    to: getFlag('to'),
    max,
  }
}

// ─── Lead selection ─────────────────────────────────────────────────
interface LeadRow {
  readonly id: string
  readonly email: string | null
  readonly directorName: string | null
  readonly universityName: string
  readonly state: string
  readonly programTypes: string | null
  readonly tier: string
}

async function loadEligibleLeads(flags: Flags): Promise<readonly LeadRow[]> {
  const prisma = await getPrisma()
  const tierFilter =
    flags.wave === 1 ? { equals: 'Tier 1' } : { in: ['Tier 2', 'Tier 3'] }

  // Touch 1: anyone not contacted yet
  // Touch 2: anyone where Touch 1 went out but they haven't replied
  const statusFilter =
    flags.touch === 1
      ? { equals: 'not_contacted' }
      : { equals: 'wave1_sent' }

  // For Touch 2, only contact leads where it's been >= 5 days since
  // Touch 1 — the runbook cadence. Skip the date filter on Touch 1.
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)

  const rows = await prisma.programDirectorLead.findMany({
    where: {
      tier: tierFilter,
      outreachStatus: statusFilter,
      emailStatus: 'Valid',
      email: { not: null },
      ...(flags.touch === 2
        ? { lastContactedAt: { lte: fiveDaysAgo } }
        : {}),
    },
    orderBy: [{ tier: 'asc' }, { state: 'asc' }, { universityName: 'asc' }],
    take: flags.max,
    select: {
      id: true,
      email: true,
      directorName: true,
      universityName: true,
      state: true,
      programTypes: true,
      tier: true,
    },
  })

  return rows
}

// ─── Merge tag resolver ─────────────────────────────────────────────
interface Template {
  readonly id: string
  readonly subject: string
  readonly body: string
}

async function loadTemplate(name: string): Promise<Template> {
  const prisma = await getPrisma()
  const tpl = await prisma.emailTemplate.findFirst({
    where: { name },
    select: { id: true, subject: true, body: true },
  })
  if (!tpl) {
    console.error(`[send-pd-wave] template not found: ${name} (run scripts/seed-pd-email-templates.ts first)`)
    process.exit(1)
  }
  return tpl
}

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ||
    'https://pmhnphiring.com'
  )
}

interface MergeContext {
  readonly director_name: string
  readonly university_name: string
  readonly state: string
  readonly program_types: string
  readonly shortlink: string
}

function buildMergeContext(lead: LeadRow): MergeContext {
  // Greeting fallback when the CSV had no director name on file. "Director"
  // reads more polished than "There" in a B2B partnership email.
  const directorName = lead.directorName?.trim() || 'Director'
  return {
    director_name: directorName,
    university_name: lead.universityName,
    state: lead.state,
    program_types: lead.programTypes ?? 'PMHNP programs',
    // /r/p0 → /for-programs (resolver special-cases the 'p' letter).
    // ?r=<lead_id> closes the per-recipient attribution loop on click.
    shortlink: `${baseUrl()}/r/p0?r=${lead.id}`,
  }
}

function applyMerge(template: string, ctx: MergeContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = (ctx as unknown as Record<string, string>)[key]
    if (value === undefined) {
      throw new Error(`Unknown merge tag: {{${key}}} (context has: ${Object.keys(ctx).join(', ')})`)
    }
    return value
  })
}

// ─── HTML wrapper ───────────────────────────────────────────────────
// The PD touch emails are plain-text-style for deliverability. We still
// emit minimal HTML so Resend gets a well-formed `html` field; the wrapper
// preserves line breaks and renders the shortlink as a real anchor.
function buildHtml(plainBody: string): string {
  const escaped = plainBody
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  // Make URLs clickable (covers the {{shortlink}} after merge).
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>',
  )
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1A2E35;max-width:600px;margin:0;padding:0;"><div style="white-space:pre-wrap;">${linked}</div></body></html>`
}

// ─── Main ───────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface SendStats {
  attempted: number
  sent: number
  skipped: number
  failed: number
}

async function main() {
  const flags = parseFlags()
  console.log(
    `[send-pd-wave] wave=${flags.wave} touch=${flags.touch} ` +
      `execute=${flags.execute} max=${flags.max}` +
      (flags.to ? ` to=${flags.to} (TEST MODE — overriding recipient)` : ''),
  )

  if (!flags.execute) {
    console.log('[send-pd-wave] DRY RUN — no emails will be sent. Pass --execute to send.')
  }

  // Safety: refuse to --execute when the merge-tag shortlink would
  // resolve to localhost. Without this, a script run with local .env
  // vars would email PDs a `http://localhost:3000/r/p0?r=...` link.
  if (flags.execute) {
    const url = baseUrl()
    if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url)) {
      console.error(
        `[send-pd-wave] ✗ REFUSING TO SEND: baseUrl resolves to "${url}".\n` +
          `  Set NEXT_PUBLIC_BASE_URL=https://pmhnphiring.com (or your real domain)\n` +
          `  in the environment before running with --execute.`,
      )
      process.exit(1)
    }
  }

  const templateName =
    flags.touch === 1 ? 'pd-touch-1-intro' : 'pd-touch-2-follow-up'
  const template = await loadTemplate(templateName)
  console.log(`[send-pd-wave] template: ${templateName} (id=${template.id})`)

  const leads = await loadEligibleLeads(flags)
  console.log(`[send-pd-wave] eligible leads: ${leads.length}`)

  if (leads.length === 0) {
    console.log('[send-pd-wave] nothing to send. Exiting.')
    return
  }

  // Pre-flight: in test mode, refuse if no --to override (you don't want
  // an accidental real send during a test).
  if (flags.execute && !flags.to && leads.length > 10) {
    console.warn(
      `[send-pd-wave] About to send to ${leads.length} real recipients. ` +
        `Continuing in 3 seconds — Ctrl-C to abort.`,
    )
    await sleep(3000)
  }

  const stats: SendStats = { attempted: 0, sent: 0, skipped: 0, failed: 0 }
  const prisma = await getPrisma()
  const emailService = flags.execute ? await getEmailService() : null

  for (const lead of leads) {
    stats.attempted += 1

    if (!lead.email) {
      console.log(`[send-pd-wave] skip (no email): ${lead.universityName}`)
      stats.skipped += 1
      continue
    }

    const ctx = buildMergeContext(lead)
    const subject = applyMerge(template.subject, ctx)
    const body = applyMerge(template.body, ctx)
    const html = buildHtml(body)
    const recipient = flags.to ?? lead.email

    if (!flags.execute) {
      console.log(`[dry-run] would send to ${recipient}`)
      console.log(`  → subject: ${subject}`)
      console.log(`  → shortlink: ${ctx.shortlink}`)
      console.log(`  → director: ${ctx.director_name} @ ${ctx.university_name} (${ctx.state}, ${lead.tier})`)
      stats.skipped += 1
      continue
    }

    try {
      // Suppression check — same gate every other transactional send uses.
      const suppressed = await emailService!.isEmailSuppressed(recipient)
      if (suppressed) {
        console.log(`[send-pd-wave] suppressed: ${recipient}`)
        stats.skipped += 1
        continue
      }

      const result = await emailService!.sendAndLog(
        {
          from: '', // sendAndLog picks marketing sender based on emailType
          to: recipient,
          subject,
          html,
        },
        'pd_outreach',
        {
          lead_id: lead.id,
          tier: lead.tier,
          touch: flags.touch,
          wave: flags.wave,
          university: lead.universityName,
          state: lead.state,
        },
      )

      // Update only for real sends to the lead's real email. Test sends
      // (--to override) should not corrupt the lead's outreach state.
      if (!flags.to) {
        const nextFollowUp = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
        await prisma.programDirectorLead.update({
          where: { id: lead.id },
          data: {
            outreachStatus: flags.touch === 1 ? 'wave1_sent' : 'wave2_sent',
            lastContactedAt: new Date(),
            nextFollowUpAt: nextFollowUp,
          },
        })
      }

      console.log(
        `[send-pd-wave] ✓ sent to ${recipient} (resend_id=${result?.data?.id ?? 'unknown'})`,
      )
      stats.sent += 1
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[send-pd-wave] ✗ failed for ${recipient}: ${msg}`)
      stats.failed += 1
    }

    // Throttle: 1.5s between sends keeps us under Resend's 10/s rate
    // limit with plenty of headroom and avoids Gmail's "burst" heuristic.
    await sleep(1500)
  }

  console.log('[send-pd-wave] ────────────────────────────────────')
  console.log(`[send-pd-wave] attempted: ${stats.attempted}`)
  console.log(`[send-pd-wave] sent:      ${stats.sent}`)
  console.log(`[send-pd-wave] skipped:   ${stats.skipped}`)
  console.log(`[send-pd-wave] failed:    ${stats.failed}`)
  if (flags.execute && !flags.to) {
    console.log(`[send-pd-wave] (lead outreach_status updated for sent rows)`)
  }

  await prisma.$disconnect()
}

main().catch((err: unknown) => {
  console.error('[send-pd-wave] fatal:', err)
  process.exit(1)
})
