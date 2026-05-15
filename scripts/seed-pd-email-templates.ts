/**
 * seed-pd-email-templates.ts
 * ────────────────────────────────────────────────────────────────────
 * Idempotent seeder for the 3 Program Directors campaign email
 * templates. Upserts by `name` so re-running picks up copy changes.
 *
 *   npx tsx scripts/seed-pd-email-templates.ts --dry-run
 *   npx tsx scripts/seed-pd-email-templates.ts
 *
 * Templates use Mustache-style `{{tag}}` placeholders. Send-time
 * resolution lives in the (future) wave-send script; this file is the
 * source of truth for the copy itself.
 *
 * Supported merge tags:
 *   {{director_name}}     — first preferred, "Director" fallback
 *   {{university_name}}   — required, never falls back
 *   {{state}}             — 2-letter code from APNA CSV
 *   {{program_types}}     — semicolon-joined list of credentials
 *   {{shortlink}}         — `https://pmhnphiring.com/r/p<ID>?r=<ID>`
 *
 * See docs/runbooks/program-directors-campaign.md §6 for the rendered
 * copy and §3 Step 7 for the runbook entry.
 */
import { config as dotenvConfig } from 'dotenv'
dotenvConfig({ path: '.env.local' })
dotenvConfig({ path: '.env' })
dotenvConfig({ path: '.env.prod' })

// Dynamic prisma import so dotenv runs first.
type PrismaModule = typeof import('@/lib/prisma')
let prismaCache: PrismaModule['prisma'] | null = null
async function getPrisma() {
  if (!prismaCache) prismaCache = (await import('@/lib/prisma')).prisma
  return prismaCache
}

const DRY_RUN = process.argv.includes('--dry-run')

interface TemplateSpec {
  readonly name: string
  readonly subject: string
  readonly body: string
}

const TOUCH_1: TemplateSpec = {
  name: 'pd-touch-1-intro',
  // Wave 1 will A/B this against an alternate subject — see runbook §9.
  // The fallback subject lives here as the canonical record; the
  // alternate is applied at send time as a per-recipient override.
  subject: 'Helping {{university_name}} PMHNP grads find jobs',
  body: `Hi {{director_name}},

I run pmhnphiring.com — a job board built specifically for PMHNPs. Right now we list thousands of active PMHNP roles across the US, and your students at {{university_name}} are some of the most sought-after candidates in the {{state}} market.

I'm reaching out because we built something program directors have been asking for: a free embeddable jobs widget you can drop on your career services page. It shows your students the most recent PMHNP roles in {{state}}, updates daily, and we can co-brand it with your program.

Two-minute demo of what it looks like for a peer program:
{{shortlink}}

If it's useful, I'd love to set up a 15-minute call. Either way, I'd welcome any feedback — we're building this for programs like yours.

Best,
Sathish
Creator, pmhnphiring.com`,
}

const TOUCH_2: TemplateSpec = {
  name: 'pd-touch-2-follow-up',
  // "Re:" prefix encourages Gmail to thread with Touch 1, which keeps
  // the follow-up out of the Promotions tab.
  subject: 'Re: Helping {{university_name}} PMHNP grads find jobs',
  body: `Hi {{director_name}},

Following up on my note last week — I wanted to share what the widget looks like in practice. Here's a 60-second walkthrough:

{{shortlink}}  →  takes you to the live widget on /for-programs

A few program directors have asked about a quarterly placement report as well — it tracks where PMHNPs in {{state}} are getting hired by setting, salary range, and employer type. Useful for CCNE/ACEN accreditation files. Happy to set that up alongside the widget if it's useful.

If you'd like to talk for 15 minutes, reply with 2–3 times that work for you this week or next and I'll send a calendar invite.

And if this isn't a fit, no worries — just reply with "not interested" and I'll take you off the list.

Best,
Sathish`,
}

const TOUCH_3: TemplateSpec = {
  name: 'pd-touch-3-soft-bump',
  // LinkedIn DM has a 300-character limit and no subject field. The
  // subject column here is descriptive metadata for the admin UI; the
  // sending workflow drops it.
  subject: '[LinkedIn DM] Soft follow-up — {{university_name}}',
  body: `Hi {{director_name}} — I sent a couple of notes last week about a free PMHNP jobs widget for {{university_name}}'s career services page. No worries if it's not a fit; happy to share the placement-report sample if it's useful for your accreditation file. Either way, hope your term is going well.`,
}

const TEMPLATES: readonly TemplateSpec[] = [TOUCH_1, TOUCH_2, TOUCH_3]

interface SeedStats {
  readonly inserted: number
  readonly updated: number
}

async function upsertOne(spec: TemplateSpec): Promise<'inserted' | 'updated' | 'unchanged'> {
  const prisma = await getPrisma()
  const existing = await prisma.emailTemplate.findFirst({
    where: { name: spec.name },
    select: { id: true, subject: true, body: true },
  })

  if (existing) {
    const unchanged = existing.subject === spec.subject && existing.body === spec.body
    if (unchanged) {
      console.log(`[seed]   ${spec.name}: unchanged (id=${existing.id})`)
      return 'unchanged'
    }
    if (!DRY_RUN) {
      await prisma.emailTemplate.update({
        where: { id: existing.id },
        data: { subject: spec.subject, body: spec.body },
      })
    }
    console.log(`[seed]   ${spec.name}: updated (id=${existing.id})`)
    return 'updated'
  }

  if (DRY_RUN) {
    console.log(`[seed]   ${spec.name}: would create`)
    return 'inserted'
  }
  const created = await prisma.emailTemplate.create({
    data: { name: spec.name, subject: spec.subject, body: spec.body },
  })
  console.log(`[seed]   ${spec.name}: created (id=${created.id})`)
  return 'inserted'
}

async function main() {
  console.log(`[seed] Seeding ${TEMPLATES.length} PD email templates (dry_run=${DRY_RUN})`)

  const stats: SeedStats & { unchanged: number } = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
  }

  // Manual sequential loop — these are small writes and the order
  // matters for log readability.
  for (const spec of TEMPLATES) {
    const outcome = await upsertOne(spec)
    if (outcome === 'inserted') (stats as Record<string, number>).inserted += 1
    else if (outcome === 'updated') (stats as Record<string, number>).updated += 1
    else (stats as Record<string, number>).unchanged += 1
  }

  console.log('[seed] ────────────────────────')
  console.log(`[seed] inserted:  ${stats.inserted}`)
  console.log(`[seed] updated:   ${stats.updated}`)
  console.log(`[seed] unchanged: ${stats.unchanged}`)

  const prisma = await getPrisma()
  await prisma.$disconnect()
}

main().catch((err: unknown) => {
  console.error('[seed] failed:', err)
  process.exit(1)
})
