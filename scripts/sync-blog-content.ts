/**
 * Sync content/blog/*.mdx into blog_posts, the table the live blog reads.
 *
 * Why this exists: /blog/[slug] renders rows from blog_posts, not the MDX
 * files. scripts/sync-blog-to-db.ts only ever INSERTS a slug it has not seen
 * and skips the rest, so an edit to an existing MDX file stays in the repo and
 * never reaches a reader. That is how the sourcing and house-style pass over
 * content/ landed in git while the published posts kept their old text.
 *
 * This script closes that gap in both directions that matter:
 *   - a published row whose content differs from its file is UPDATED
 *   - a slug with no row is INSERTED as a draft, to be previewed in
 *     /admin/blog before it goes live (pass --publish-new to skip the draft)
 *
 * A row that is not published (a draft or an archived post) is left alone
 * unless you name its slug. Those rows are mostly unpublished duplicates of
 * live posts, and a bulk sync must not be the thing that republishes one.
 *
 * Dry run by default. Nothing is written without --apply, and every row that
 * is about to change is first saved to tmp/ so the update can be reversed.
 *
 * Usage:
 *   npx tsx scripts/sync-blog-content.ts                       # plan only
 *   npx tsx scripts/sync-blog-content.ts --slug=a,b            # plan for two slugs
 *   npx tsx scripts/sync-blog-content.ts --apply               # write
 *   npx tsx scripts/sync-blog-content.ts --apply --publish-new # new posts go live
 *   npx tsx scripts/sync-blog-content.ts --fields=content,title,description
 *   npx tsx scripts/sync-blog-content.ts --dev                 # dev database
 */
import { config as dotenvConfig } from 'dotenv'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { BLOG_CATEGORIES } from '@/lib/blog'

export interface FaqItem {
  name: string
  text: string
}

export interface ParsedPost {
  slug: string
  title: string
  description: string | null
  category: string | null
  date: string | null
  targetKeyword: string | null
  faq: FaqItem[] | null
  body: string
}

export interface DbPost {
  slug: string
  status: string
  title: string
  content: string
  metaDescription: string | null
  faqJson: unknown
}

export type SyncField = 'content' | 'title' | 'description'

export interface PlanOptions {
  fields: SyncField[]
  onlySlugs?: string[]
}

export interface PlanItem {
  slug: string
  action: 'update' | 'insert' | 'skip'
  reason: string
  /** Column values to write. Empty for a skip, the full row for an insert. */
  data: Record<string, unknown>
  /** Em and en dashes in the live content versus the file, for the report. */
  dashes?: { before: number; after: number }
}

const DASH = /[–—]/g
const VALID_CATEGORIES = new Set<string>(BLOG_CATEGORIES.map((c) => c.id))

const normalize = (text: string): string => text.replace(/\r\n/g, '\n').trim()
const countDashes = (text: string): number => (text.match(DASH) ?? []).length

function unquote(value: string): string {
  const quoted = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
  return quoted ? value.slice(1, -1) : value
}

function parseFaq(value: string): FaqItem[] | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return null
    const items = parsed.filter(
      (item): item is FaqItem =>
        typeof item === 'object' && item !== null &&
        typeof (item as FaqItem).name === 'string' && (item as FaqItem).name.trim() !== '' &&
        typeof (item as FaqItem).text === 'string' && (item as FaqItem).text.trim() !== '',
    )
    return items.length > 0 ? items.map(({ name, text }) => ({ name, text })) : null
  } catch {
    return null
  }
}

function parseTags(value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed.join(', ') : null
  } catch {
    return null
  }
}

/** Split an MDX file into its single-line frontmatter fields and its body. */
export function parsePost(raw: string, fileName: string): ParsedPost {
  const text = raw.replace(/\r\n/g, '\n')
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  const fields: Record<string, string> = {}
  for (const line of (match?.[1] ?? '').split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  const field = (key: string): string | null => (fields[key] ? unquote(fields[key]) : null)

  return {
    slug: field('slug') ?? fileName.replace(/\.mdx$/, ''),
    title: field('title') ?? fileName.replace(/\.mdx$/, ''),
    description: field('description'),
    category: field('category'),
    date: field('date') ?? field('lastUpdated'),
    targetKeyword: field('keyword') ?? (fields.tags ? parseTags(fields.tags) : null),
    faq: fields.faq ? parseFaq(fields.faq) : null,
    body: normalize(match ? match[2] : text),
  }
}

/** Decide, per file, whether the table needs an update, an insert, or nothing. */
export function planSync(posts: ParsedPost[], rows: DbPost[], options: PlanOptions): PlanItem[] {
  const bySlug = new Map(rows.map((r) => [r.slug, r]))
  const only = options.onlySlugs && options.onlySlugs.length > 0 ? new Set(options.onlySlugs) : null

  return posts
    .filter((post) => !only || only.has(post.slug))
    .map((post): PlanItem => {
      const existing = bySlug.get(post.slug)

      if (!existing) {
        if (!post.category || !VALID_CATEGORIES.has(post.category)) {
          return { slug: post.slug, action: 'skip', reason: `category "${post.category ?? ''}" is not a blog category`, data: {} }
        }
        return {
          slug: post.slug,
          action: 'insert',
          reason: 'no row for this slug',
          data: {
            slug: post.slug,
            title: post.title,
            content: post.body,
            metaDescription: post.description,
            targetKeyword: post.targetKeyword,
            category: post.category,
            // Omitted rather than null: Prisma rejects a bare null for a Json
            // column (it wants Prisma.DbNull), and absent means no FAQ anyway.
            ...(post.faq ? { faqJson: post.faq } : {}),
            publishDate: post.date,
          },
        }
      }

      if (existing.status !== 'published' && !only) {
        return { slug: post.slug, action: 'skip', reason: `${existing.status} row; name the slug to sync it`, data: {} }
      }

      const data: Record<string, unknown> = {}
      if (options.fields.includes('content') && normalize(existing.content) !== post.body) data.content = post.body
      if (options.fields.includes('title') && existing.title !== post.title) data.title = post.title
      if (options.fields.includes('description') && post.description && existing.metaDescription !== post.description) {
        data.metaDescription = post.description
      }
      if (post.faq && JSON.stringify(existing.faqJson ?? null) !== JSON.stringify(post.faq)) data.faqJson = post.faq

      if (Object.keys(data).length === 0) {
        return { slug: post.slug, action: 'skip', reason: 'identical to the live row', data: {} }
      }
      return {
        slug: post.slug,
        action: 'update',
        reason: `changed: ${Object.keys(data).join(', ')}`,
        data,
        dashes: { before: countDashes(existing.content), after: countDashes(post.body) },
      }
    })
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function readPosts(dir: string): ParsedPost[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => parsePost(fs.readFileSync(path.join(dir, f), 'utf8'), f))
}

function argValue(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const publishNew = process.argv.includes('--publish-new')
  const useDev = process.argv.includes('--dev')
  const fields = (argValue('fields') ?? 'content').split(',').map((f) => f.trim()) as SyncField[]
  const onlySlugs = argValue('slug')?.split(',').map((s) => s.trim()).filter(Boolean)

  dotenvConfig({ path: useDev ? '.env' : '.env.prod' })
  const connectionString = useDev ? process.env.DATABASE_URL : process.env.PROD_DATABASE_URL
  if (!connectionString) {
    throw new Error(useDev ? 'DATABASE_URL is not set in .env' : 'PROD_DATABASE_URL is not set in .env.prod')
  }
  const projectRef = connectionString.match(/postgres\.([a-z0-9]+)[:@]/)?.[1] ?? 'unknown'

  const { PrismaClient } = await import('@prisma/client')
  const { PrismaPg } = await import('@prisma/adapter-pg')
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString, max: 3 })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

  try {
    const posts = readPosts(path.join(process.cwd(), 'content', 'blog'))
    const rows = await prisma.blogPost.findMany({
      select: { id: true, slug: true, status: true, title: true, content: true, metaDescription: true, faqJson: true, reviewedAt: true },
    })
    const plan = planSync(posts, rows, { fields, onlySlugs })

    const updates = plan.filter((p) => p.action === 'update')
    const inserts = plan.filter((p) => p.action === 'insert')
    const skips = plan.filter((p) => p.action === 'skip')

    console.log(`database: ${useDev ? 'dev' : 'prod'} (project ${projectRef})  files: ${posts.length}  rows: ${rows.length}`)
    console.log(`mode: ${apply ? 'APPLY' : 'dry run'}  fields: ${fields.join(', ')}  new posts: ${publishNew ? 'published' : 'draft'}\n`)
    for (const item of updates) {
      const dashes = item.dashes ? `  dashes ${item.dashes.before} -> ${item.dashes.after}` : ''
      console.log(`  UPDATE  ${item.slug}  (${item.reason})${dashes}`)
    }
    for (const item of inserts) console.log(`  INSERT  ${item.slug}  as ${publishNew ? 'published' : 'draft'}`)
    const skipReasons = new Map<string, number>()
    for (const item of skips) skipReasons.set(item.reason, (skipReasons.get(item.reason) ?? 0) + 1)
    for (const [reason, count] of skipReasons) console.log(`  SKIP    ${count} x ${reason}`)
    console.log(`\nupdate ${updates.length}, insert ${inserts.length}, skip ${skips.length}`)

    if (!apply) {
      console.log('\nDry run: nothing written. Re-run with --apply to write.')
      return
    }

    if (updates.length > 0) {
      const touched = new Set(updates.map((u) => u.slug))
      const backupDir = path.join(process.cwd(), 'tmp')
      fs.mkdirSync(backupDir, { recursive: true })
      const backupFile = path.join(backupDir, `blog-sync-backup-${Date.now()}.json`)
      fs.writeFileSync(backupFile, JSON.stringify(rows.filter((r) => touched.has(r.slug)), null, 1), 'utf8')
      console.log(`\nbackup of ${touched.size} rows written to ${backupFile}`)
    }

    const now = new Date()
    for (const item of updates) {
      // reviewedAt moves only when the article text itself changed: it drives
      // the visible "Last Reviewed" date and BlogPosting.dateModified, and a
      // metadata-only edit is not an editorial review of the article.
      const reviewed = 'content' in item.data ? { reviewedAt: now } : {}
      await prisma.blogPost.update({ where: { slug: item.slug }, data: { ...item.data, ...reviewed } })
    }
    for (const item of inserts) {
      const { publishDate, ...rest } = item.data as { publishDate: string | null } & Record<string, unknown>
      await prisma.blogPost.create({
        data: {
          ...(rest as { slug: string; title: string; content: string; category: string }),
          status: publishNew ? 'published' : 'draft',
          publishDate: publishDate ? new Date(publishDate) : now,
          reviewedAt: now,
        },
      })
    }
    console.log(`\nwrote ${updates.length} updates and ${inserts.length} inserts. Post pages revalidate hourly.`)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

if (process.argv[1] && /sync-blog-content\.ts$/.test(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
