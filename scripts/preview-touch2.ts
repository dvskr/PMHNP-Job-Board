/**
 * preview-touch2.ts
 * ────────────────────────────────────────────────────────────────────
 * Read-only preview of who will receive Touch 2 on the next run of
 * `send-pd-wave.ts --touch=2`. Useful Day-5 morning to:
 *
 *   1. Sanity-check the eligible pool size
 *   2. Spot replies that haven't been marked yet (anyone you remember
 *      replying who's still in the eligible list = update them via
 *      /admin/pd-campaign before sending)
 *   3. See the timing spread (oldest contacted at the top)
 *
 *   npx tsx scripts/preview-touch2.ts
 *
 * Same eligibility rules as the send script:
 *   - outreach_status = 'wave1_sent'
 *   - emailStatus = 'Valid' AND email IS NOT NULL
 *   - lastContactedAt <= 5 days ago
 *
 * Nothing is sent. Nothing is updated. Pure read.
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

function daysAgo(d: Date | null): string {
  if (!d) return '(never contacted)'
  const ms = Date.now() - d.getTime()
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

async function main() {
  const prisma = await getPrisma()
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)

  const eligible = await prisma.programDirectorLead.findMany({
    where: {
      outreachStatus: 'wave1_sent',
      emailStatus: 'Valid',
      email: { not: null },
      lastContactedAt: { lte: fiveDaysAgo },
    },
    orderBy: [{ lastContactedAt: 'asc' }],
    select: {
      id: true,
      directorName: true,
      universityName: true,
      state: true,
      email: true,
      tier: true,
      lastContactedAt: true,
    },
  })

  // Sibling view: leads in wave1_sent that AREN'T eligible yet — useful
  // for "this is who'll be ready tomorrow / day after"
  const inFlight = await prisma.programDirectorLead.findMany({
    where: {
      outreachStatus: 'wave1_sent',
      emailStatus: 'Valid',
      email: { not: null },
      lastContactedAt: { gt: fiveDaysAgo },
    },
    orderBy: [{ lastContactedAt: 'asc' }],
    select: { universityName: true, state: true, lastContactedAt: true },
  })

  // Tier breakdown
  const byTier: Record<string, number> = {}
  for (const lead of eligible) {
    byTier[lead.tier] = (byTier[lead.tier] ?? 0) + 1
  }

  console.log('═══ Touch 2 — Day-of preview ═══')
  console.log('')
  console.log(`Eligible for Touch 2 NOW:    ${eligible.length}`)
  console.log(`Still in <5-day cooldown:    ${inFlight.length}`)
  console.log('')
  if (eligible.length === 0) {
    console.log('Nothing to send today. Either:')
    console.log('  - You haven\'t run Touch 1 yet')
    console.log('  - All Touch-1 leads got marked as replied/declined/booked')
    console.log('  - 5 days hasn\'t passed since the most recent Touch 1')
    await prisma.$disconnect()
    return
  }

  console.log('By tier:')
  for (const t of ['Tier 1', 'Tier 2', 'Tier 3']) {
    if (byTier[t]) console.log(`  ${t}: ${byTier[t]}`)
  }
  console.log('')
  console.log('Top 10 eligible (oldest contacted first — these go first):')
  console.log('─'.repeat(80))
  for (const lead of eligible.slice(0, 10)) {
    const name = (lead.directorName ?? '(no director)').padEnd(28).slice(0, 28)
    const uni = lead.universityName.padEnd(34).slice(0, 34)
    const age = daysAgo(lead.lastContactedAt).padStart(12)
    console.log(`  ${name} ${uni} ${lead.state}  ${age}`)
  }
  if (eligible.length > 10) {
    console.log(`  … +${eligible.length - 10} more (run --touch=2 to send them all)`)
  }

  if (inFlight.length > 0) {
    console.log('')
    console.log('Next batch — eligible in 1-5 days:')
    console.log('─'.repeat(80))
    for (const lead of inFlight.slice(0, 5)) {
      const uni = lead.universityName.padEnd(36).slice(0, 36)
      const sentAge = daysAgo(lead.lastContactedAt)
      console.log(`  ${uni} ${lead.state}  Touch 1 ${sentAge}`)
    }
    if (inFlight.length > 5) {
      console.log(`  … +${inFlight.length - 5} more`)
    }
  }

  console.log('')
  console.log('To send Touch 2 to the eligible pool:')
  console.log(
    '  $env:NEXT_PUBLIC_BASE_URL="https://pmhnphiring.com"; npx tsx scripts/send-pd-wave.ts --wave=all --touch=2 --execute --max=50',
  )
  console.log('')
  console.log('Tip — before sending, visit /admin/pd-campaign and mark any')
  console.log('replies-since-Day-1 that you remember but haven\'t logged yet.')

  await prisma.$disconnect()
}

main().catch((err: unknown) => {
  console.error('[preview-touch2] failed:', err)
  process.exit(1)
})
