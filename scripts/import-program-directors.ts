/**
 * import-program-directors.ts
 * ────────────────────────────────────────────────────────────────────
 * Seeds `program_director_leads` from the APNA Graduate Programs
 * Directory CSV at the repo root.
 *
 *   npx tsx scripts/import-program-directors.ts --dry-run
 *   npx tsx scripts/import-program-directors.ts
 *
 * Idempotent: upserts on (universityName, directorName). Programs with a
 * NULL directorName are matched on universityName alone (Postgres treats
 * NULL as distinct in unique indexes, so the upsert path falls through
 * to manual lookup for those rows).
 *
 * Source file is hard-coded because the APNA directory ships with a
 * leading-space-suffix oddity in the filename. See SOURCE_PATH below.
 *
 * See docs/runbooks/program-directors-campaign.md §3 Step 4 for context.
 */
import { config as dotenvConfig } from 'dotenv'
dotenvConfig({ path: '.env.local' })
dotenvConfig({ path: '.env' })
dotenvConfig({ path: '.env.prod' })

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'csv-parse/sync'

// Dynamic prisma import so dotenv runs first.
type PrismaModule = typeof import('@/lib/prisma')
let prismaCache: PrismaModule['prisma'] | null = null
async function getPrisma() {
  if (!prismaCache) prismaCache = (await import('@/lib/prisma')).prisma
  return prismaCache
}

const DRY_RUN = process.argv.includes('--dry-run')

// Filename has a trailing space before `.csv`. Don't "fix" this by
// renaming the file — keep the script aligned with the asset as shipped.
const SOURCE_PATH = join(process.cwd(), 'APNA_Graduate_Programs_Directory .csv')

interface CsvRow {
  State: string
  Tier: string
  'University Name': string
  'Program Director Name': string
  Email: string
  Phone: string
  'Program Type': string
  'Distance Education %': string
  'Program Website URL': string
  'Email Status': string
  'Cohort Size': string
  'Graduation Month': string
  'Outreach Status': string
  Notes: string
}

interface ImportStats {
  total: number
  inserted: number
  updated: number
  skipped: number
  skippedReasons: Record<string, number>
}

function emptyToNull(v: string | undefined): string | null {
  if (v === undefined || v === null) return null
  const trimmed = v.trim()
  return trimmed.length === 0 ? null : trimmed
}

function parseCohortSize(v: string | undefined): number | null {
  const s = emptyToNull(v)
  if (s === null) return null
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

async function main() {
  if (!existsSync(SOURCE_PATH)) {
    console.error(`[import] Source file not found: ${SOURCE_PATH}`)
    process.exit(1)
  }

  const raw = readFileSync(SOURCE_PATH, 'utf-8')
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as CsvRow[]

  console.log(`[import] Parsed ${rows.length} rows from CSV (dry_run=${DRY_RUN})`)

  const stats: ImportStats = {
    total: rows.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    skippedReasons: {},
  }

  const prisma = await getPrisma()

  for (const row of rows) {
    const universityName = emptyToNull(row['University Name'])
    const directorName = emptyToNull(row['Program Director Name'])
    const email = emptyToNull(row['Email'])
    const state = emptyToNull(row['State'])
    const tier = emptyToNull(row['Tier'])

    // Hard requirements — without these we cannot do anything useful.
    if (!universityName || !state || !tier) {
      stats.skipped += 1
      const reason = !universityName
        ? 'missing_university'
        : !state
          ? 'missing_state'
          : 'missing_tier'
      stats.skippedReasons[reason] = (stats.skippedReasons[reason] ?? 0) + 1
      continue
    }

    // Soft requirement — a row with neither director nor email is not
    // outreach-actionable, but we still record it so we know about the
    // program. Outreach will skip these via the email filter.
    if (!directorName && !email) {
      stats.skippedReasons['no_director_or_email'] =
        (stats.skippedReasons['no_director_or_email'] ?? 0) + 1
      // fall through — we still want the program on file
    }

    const data = {
      state,
      tier,
      universityName,
      directorName,
      email,
      emailStatus: emptyToNull(row['Email Status']),
      phone: emptyToNull(row['Phone']),
      programTypes: emptyToNull(row['Program Type']),
      distanceEducation: emptyToNull(row['Distance Education %']),
      programWebsiteUrl: emptyToNull(row['Program Website URL']),
      cohortSize: parseCohortSize(row['Cohort Size']),
      graduationMonth: emptyToNull(row['Graduation Month']),
      notes: emptyToNull(row['Notes']),
    }

    if (DRY_RUN) {
      stats.inserted += 1
      continue
    }

    // Postgres treats NULL as distinct in unique indexes, so the
    // composite unique (universityName, directorName) won't match a
    // pre-existing row with directorName=null. Handle that path manually.
    if (directorName === null) {
      const existing = await prisma.programDirectorLead.findFirst({
        where: { universityName, directorName: null },
      })
      if (existing) {
        await prisma.programDirectorLead.update({
          where: { id: existing.id },
          data,
        })
        stats.updated += 1
      } else {
        await prisma.programDirectorLead.create({ data })
        stats.inserted += 1
      }
      continue
    }

    const before = await prisma.programDirectorLead.findUnique({
      where: {
        universityName_directorName: { universityName, directorName },
      },
    })

    await prisma.programDirectorLead.upsert({
      where: {
        universityName_directorName: { universityName, directorName },
      },
      create: data,
      update: data,
    })

    if (before) stats.updated += 1
    else stats.inserted += 1
  }

  console.log('[import] ────────────────────────')
  console.log(`[import] total:    ${stats.total}`)
  console.log(`[import] inserted: ${stats.inserted}`)
  console.log(`[import] updated:  ${stats.updated}`)
  console.log(`[import] skipped:  ${stats.skipped}`)
  if (Object.keys(stats.skippedReasons).length > 0) {
    console.log('[import] skipped reasons:')
    for (const [reason, count] of Object.entries(stats.skippedReasons)) {
      console.log(`[import]   ${reason}: ${count}`)
    }
  }

  if (!DRY_RUN) {
    const totalInDb = await prisma.programDirectorLead.count()
    const validEmails = await prisma.programDirectorLead.count({
      where: { emailStatus: 'Valid' },
    })
    console.log(`[import] db count: ${totalInDb} (${validEmails} with Valid email status)`)
  }

  await prisma.$disconnect()
}

main().catch((err: unknown) => {
  console.error('[import] failed:', err)
  process.exit(1)
})
