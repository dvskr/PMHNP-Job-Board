/**
 * migrate-pd-data-to-prod.ts
 * ────────────────────────────────────────────────────────────────────
 * One-shot copy of PD campaign data from the local/dev Supabase
 * (whatever .env.local → DATABASE_URL points to) into the production
 * Supabase (.env.prod → PROD_DATABASE_URL).
 *
 * Why this exists: early in this campaign the scripts loaded
 * .env.local first, so all PD lead imports + send-state updates landed
 * in the dev DB while production Vercel was writing clicks + webhooks
 * to the prod DB. This script reconciles by mirroring the dev tables
 * into prod — preserving UUIDs so the recipient_lead_id values already
 * in prod's shortlink_clicks resolve correctly.
 *
 *   npx tsx scripts/migrate-pd-data-to-prod.ts --dry-run
 *   npx tsx scripts/migrate-pd-data-to-prod.ts
 *
 * Idempotent (upsert by id). Safe to re-run.
 *
 * Tables touched in PROD:
 *   - program_director_leads          (insert/update — was empty)
 *   - email_sends WHERE email_type='pd_outreach'   (insert/update — was empty)
 *
 * Nothing else in prod is read or written.
 */
import { config } from 'dotenv'
import type { ProgramDirectorLead, EmailSend, PrismaClient as PrismaClientType } from '@prisma/client'

// Load env files in a SPECIFIC order so we can read both DB URLs:
//   1. .env.local — gives us the DEV DATABASE_URL (no override needed, just read it)
//   2. .env.prod  — provides PROD_DATABASE_URL alongside (we override to get its other vars too)
config({ path: '.env.local' })
const DEV_URL = process.env.DATABASE_URL ?? ''
const DEV_DIRECT = process.env.DIRECT_URL ?? DEV_URL

// Capture before .env.prod overrides DATABASE_URL (it shouldn't, since
// .env.prod doesn't define DATABASE_URL — only PROD_DATABASE_URL — but
// be paranoid).
config({ path: '.env.prod', override: false })
const PROD_URL = process.env.PROD_DATABASE_URL ?? ''
const PROD_DIRECT = process.env.PROD_DIRECT_DATABASE_URL ?? PROD_URL

const DRY_RUN = process.argv.includes('--dry-run')

function hostnameOf(url: string): string {
  return url.match(/@([^:/?]+)/)?.[1] ?? '(unknown)'
}

async function main() {
  if (!DEV_URL) throw new Error('DEV DATABASE_URL not found in .env.local')
  if (!PROD_URL) throw new Error('PROD_DATABASE_URL not found in .env.prod')
  if (DEV_URL === PROD_URL) {
    throw new Error('DEV and PROD URLs are identical — refusing to "migrate" within the same DB')
  }

  console.log('[migrate-pd] DEV  →', hostnameOf(DEV_URL))
  console.log('[migrate-pd] PROD →', hostnameOf(PROD_URL))
  console.log(`[migrate-pd] dry_run=${DRY_RUN}`)
  console.log('')

  // Use the generated Prisma client with explicit datasource overrides.
  // Both connections share the same generated client; only the URL
  // differs.
  // Prisma 7.x uses the driver-adapter pattern — pg Pool + PrismaPg
  // adapter — same as lib/prisma.ts. Each connection needs its own Pool
  // and adapter; we hold both at once so we can read DEV → write PROD.
  const { PrismaClient } = await import('@prisma/client')
  const { PrismaPg } = await import('@prisma/adapter-pg')
  const { Pool } = await import('pg')

  const devPool = new Pool({ connectionString: DEV_DIRECT })
  const prodPool = new Pool({ connectionString: PROD_DIRECT })
  const dev = new PrismaClient({ adapter: new PrismaPg(devPool) }) as PrismaClientType
  const prod = new PrismaClient({ adapter: new PrismaPg(prodPool) }) as PrismaClientType

  try {
    // ─── Step 1: program_director_leads ────────────────────────────
    const devLeads = await dev.programDirectorLead.findMany()
    console.log(`[migrate-pd] Step 1 — found ${devLeads.length} PD leads in DEV`)

    const statusBreakdown = new Map<string, number>()
    for (const l of devLeads) {
      statusBreakdown.set(l.outreachStatus, (statusBreakdown.get(l.outreachStatus) ?? 0) + 1)
    }
    for (const [status, count] of statusBreakdown) {
      console.log(`[migrate-pd]   ${status.padEnd(15)} ${count}`)
    }

    if (!DRY_RUN) {
      let migrated = 0
      for (const lead of devLeads) {
        const { id, ...rest } = lead
        await prod.programDirectorLead.upsert({
          where: { id },
          create: { id, ...rest },
          update: rest,
        })
        migrated += 1
        if (migrated % 25 === 0) {
          console.log(`[migrate-pd]   …${migrated}/${devLeads.length}`)
        }
      }
      console.log(`[migrate-pd] Step 1 — migrated ${migrated} PD leads to PROD`)
    }
    console.log('')

    // ─── Step 2: pd_outreach EmailSend rows ────────────────────────
    const devSends = await dev.emailSend.findMany({
      where: { emailType: 'pd_outreach' },
    })
    console.log(`[migrate-pd] Step 2 — found ${devSends.length} pd_outreach EmailSend rows in DEV`)

    const sendStatusBreakdown = new Map<string, number>()
    for (const s of devSends) {
      const k = s.status ?? 'null'
      sendStatusBreakdown.set(k, (sendStatusBreakdown.get(k) ?? 0) + 1)
    }
    for (const [status, count] of sendStatusBreakdown) {
      console.log(`[migrate-pd]   ${status.padEnd(15)} ${count}`)
    }

    if (!DRY_RUN) {
      let migrated = 0
      for (const send of devSends) {
        const { id, ...rest } = send
        await prod.emailSend.upsert({
          where: { id },
          create: { id, ...rest },
          update: rest,
        })
        migrated += 1
        if (migrated % 25 === 0) {
          console.log(`[migrate-pd]   …${migrated}/${devSends.length}`)
        }
      }
      console.log(`[migrate-pd] Step 2 — migrated ${migrated} EmailSend rows to PROD`)
    }
    console.log('')

    // ─── Step 3: Verify final PROD state ──────────────────────────
    if (!DRY_RUN) {
      const prodLeadCount = await prod.programDirectorLead.count()
      const prodSendCount = await prod.emailSend.count({ where: { emailType: 'pd_outreach' } })
      console.log('[migrate-pd] Final PROD state:')
      console.log(`[migrate-pd]   program_director_leads: ${prodLeadCount}`)
      console.log(`[migrate-pd]   pd_outreach EmailSend:  ${prodSendCount}`)

      // Recipient_lead_id linkage check — count clicks that now resolve
      const clickLinkage = await prod.shortLinkClick.findMany({
        where: { platform: 'program-director', recipientLeadId: { not: null } },
        select: { recipientLeadId: true },
      })
      const distinctLeadIds = new Set(clickLinkage.map((c) => c.recipientLeadId))
      const resolvableLeads = await prod.programDirectorLead.count({
        where: { id: { in: Array.from(distinctLeadIds).filter((x): x is string => x !== null) } },
      })
      console.log(`[migrate-pd]   PD clicks with recipient_lead_id: ${clickLinkage.length}`)
      console.log(`[migrate-pd]   Distinct lead UUIDs in those clicks: ${distinctLeadIds.size}`)
      console.log(`[migrate-pd]   Of those, lead rows now in PROD: ${resolvableLeads}`)
    }
  } finally {
    await dev.$disconnect()
    await prod.$disconnect()
  }
}

main().catch((err: unknown) => {
  console.error('[migrate-pd] failed:', err)
  process.exit(1)
})
