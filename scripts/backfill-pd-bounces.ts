/**
 * backfill-pd-bounces.ts
 * ────────────────────────────────────────────────────────────────────
 * One-shot sync: looks at every EmailSend row with status='bounced'
 * (or 'complained') for emailType='pd_outreach' and flips the matching
 * ProgramDirectorLead's outreach_status accordingly.
 *
 * Why this exists: the Resend webhook patched on 2026-05-19 propagates
 * bounces to ProgramDirectorLead going forward. But the bounces that
 * landed BEFORE the patch (Wave 1 Day 1) need a one-time backfill.
 *
 *   npx tsx scripts/backfill-pd-bounces.ts --dry-run
 *   npx tsx scripts/backfill-pd-bounces.ts
 *
 * Safe to re-run — only flips status if the lead isn't already
 * 'bounced' or 'declined'.
 */
import { config as dotenvConfig } from 'dotenv'
dotenvConfig({ path: '.env.local' })
dotenvConfig({ path: '.env' })
dotenvConfig({ path: '.env.prod' })

type PrismaModule = typeof import('@/lib/prisma')
let prismaCache: PrismaModule['prisma'] | null = null
async function getPrisma() {
  if (!prismaCache) prismaCache = (await import('@/lib/prisma')).prisma
  return prismaCache
}

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const prisma = await getPrisma()
  console.log(`[backfill-pd-bounces] dry_run=${DRY_RUN}`)

  // Pull every pd_outreach send with a non-success final status.
  const bouncedSends = await prisma.emailSend.findMany({
    where: {
      emailType: 'pd_outreach',
      status: { in: ['bounced', 'complained'] },
    },
    select: { to: true, status: true },
  })

  console.log(`[backfill-pd-bounces] found ${bouncedSends.length} bounce/complaint sends to sync`)

  if (bouncedSends.length === 0) {
    console.log('[backfill-pd-bounces] nothing to do.')
    await prisma.$disconnect()
    return
  }

  // Dedup by email (a recipient may have multiple sends).
  type Outcome = 'bounced' | 'declined'
  const byEmail = new Map<string, Outcome>()
  for (const send of bouncedSends) {
    const norm = send.to.toLowerCase().trim()
    // Bounce wins over complaint if both happen (bounce is more definitive)
    const desired: Outcome = send.status === 'bounced' ? 'bounced' : 'declined'
    if (byEmail.get(norm) !== 'bounced') byEmail.set(norm, desired)
  }

  console.log(`[backfill-pd-bounces] unique recipients to flip: ${byEmail.size}`)

  let flipped = 0
  let skipped = 0
  let notFound = 0
  for (const [email, outcome] of byEmail) {
    const lead = await prisma.programDirectorLead.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, outreachStatus: true, universityName: true },
    })
    if (!lead) {
      console.log(`  ✗ not found in PD leads: ${email}`)
      notFound += 1
      continue
    }
    if (lead.outreachStatus === outcome) {
      skipped += 1
      continue
    }
    if (lead.outreachStatus === 'bounced' && outcome === 'declined') {
      // bounced wins over a later complaint
      skipped += 1
      continue
    }
    if (DRY_RUN) {
      console.log(`  → would flip ${email} (${lead.universityName}): ${lead.outreachStatus} → ${outcome}`)
      flipped += 1
      continue
    }
    await prisma.programDirectorLead.update({
      where: { id: lead.id },
      data: {
        outreachStatus: outcome,
        ...(outcome === 'bounced' ? { emailStatus: 'Bounced' } : {}),
      },
    })
    flipped += 1
    console.log(`  ✓ ${email} (${lead.universityName}): → ${outcome}`)
  }

  console.log('[backfill-pd-bounces] ────────────────────────')
  console.log(`[backfill-pd-bounces] flipped:   ${flipped}`)
  console.log(`[backfill-pd-bounces] skipped:   ${skipped} (already correct status)`)
  console.log(`[backfill-pd-bounces] not_found: ${notFound} (email not in PD leads — sent via a different campaign)`)

  await prisma.$disconnect()
}

main().catch((err: unknown) => {
  console.error('[backfill-pd-bounces] failed:', err)
  process.exit(1)
})
