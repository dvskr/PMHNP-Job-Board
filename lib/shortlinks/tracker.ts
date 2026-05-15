import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { captureException } from '@/lib/sentry'
import type { ShortlinkResolution, BotIdentification } from './types'

/**
 * Server-side click recorder for the short-link subsystem.
 *
 * Design constraints:
 *   - Never block the redirect. The route handler MUST call this with
 *     `void recordClick(...)` so a DB hiccup can't slow the user down.
 *   - Privacy-first. Raw IPs are never stored; we hash with a salt that
 *     rotates daily so cross-day correlation is computationally hard,
 *     while same-day idempotency still works.
 *   - Defensive on input. The handler validates UA / referer length, but
 *     we re-truncate here so any internal caller can't accidentally write
 *     a multi-kB UA into Postgres.
 */

const UA_MAX_LEN = 512
const REFERER_MAX_LEN = 512

/**
 * Daily-rotating IP hash salt.
 *
 * Built from a stable secret (env-supplied or process-PID fallback) plus
 * the UTC calendar day. Same IP same day → same hash. Same IP next day →
 * unrelated hash. We never persist the salt; rolling forward is automatic.
 *
 * In serverless cold starts the secret defaults to a per-instance fallback
 * if SHORTLINK_HASH_SECRET isn't set. That degrades dedup correctness
 * across instances but never compromises privacy.
 */
function ipHashSalt(now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
  const secret =
    process.env.SHORTLINK_HASH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    `pmhnp-fallback-${process.pid}`
  return `${secret}::${day}`
}

export function hashIp(ip: string | null | undefined, now: Date = new Date()): string | null {
  if (!ip || ip.trim().length === 0) return null
  const salt = ipHashSalt(now)
  return createHash('sha256').update(`${salt}::${ip.trim()}`).digest('hex')
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

function normalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  // Validate length BEFORE truncating so 'USA' fails the shape check
  // rather than silently becoming 'US'.
  return /^[A-Za-z]{2}$/.test(trimmed) ? trimmed.toUpperCase() : null
}

/**
 * Idempotency window. Same (code, ip_hash, is_bot=false) within this many
 * seconds collapses to one row. 60s covers the "F5 / accidental retap on
 * mobile" case without losing genuine repeat traffic ("the recruiter
 * clicked again 10 min later").
 */
const IDEMPOTENCY_WINDOW_SECONDS = 60

export interface RecordClickInput {
  readonly resolution: ShortlinkResolution
  readonly code: string
  readonly bot: BotIdentification
  readonly ip: string | null
  readonly userAgent: string | null
  readonly referer: string | null
  readonly country: string | null
  /** Per-recipient attribution token from `?r=<lead_id>`. Validated by
   *  the route handler before reaching here; null for organic clicks. */
  readonly recipientLeadId?: string | null
  /** Override for tests; defaults to current time. */
  readonly now?: Date
}

/**
 * Insert one click row. Returns silently on any error so the caller's
 * redirect path is never affected. Always called via `void`.
 */
export async function recordClick(input: RecordClickInput): Promise<void> {
  const now = input.now ?? new Date()
  const ipHash = hashIp(input.ip, now)
  const userAgent = truncate(input.userAgent, UA_MAX_LEN)
  const referer = truncate(input.referer, REFERER_MAX_LEN)
  const country = normalizeCountry(input.country)

  // Idempotency check (only for real human-looking traffic; bot rows are
  // append-only so we can count preview-fetch volume accurately).
  //
  // recipientLeadId is part of the dedup key so two different recipients
  // sharing an IP (same office, same campus) don't collapse into one row.
  // null is treated as a distinct value from any concrete lead id, which
  // matches Postgres's NULL-is-distinct semantics for our purposes.
  const recipientLeadId = input.recipientLeadId ?? null
  if (!input.bot.isBot && ipHash) {
    try {
      const windowStart = new Date(now.getTime() - IDEMPOTENCY_WINDOW_SECONDS * 1000)
      const recent = await prisma.shortLinkClick.findFirst({
        where: {
          code: input.code,
          ipHash,
          isBot: false,
          recipientLeadId,
          createdAt: { gte: windowStart },
        },
        select: { id: true },
      })
      if (recent) {
        logger.debug('[shortlink] dedup hit — skipping insert', {
          code: input.code,
          campaign: input.resolution.campaign,
        })
        return
      }
    } catch (err) {
      // Dedup is best-effort. A failed lookup shouldn't suppress the write.
      logger.warn('[shortlink] dedup check failed', { error: err })
    }
  }

  try {
    await prisma.shortLinkClick.create({
      data: {
        code: input.code,
        campaign: input.resolution.campaign,
        platform: input.resolution.platform,
        content: input.resolution.content,
        jobId: input.resolution.jobId,
        destinationPath: input.resolution.destinationPath,
        ipHash,
        userAgent,
        referer,
        country,
        isBot: input.bot.isBot,
        botName: input.bot.botName,
        recipientLeadId,
        createdAt: now,
      },
    })
  } catch (err) {
    logger.error('[shortlink] failed to record click', err, {
      code: input.code,
      campaign: input.resolution.campaign,
    })
    captureException(err, {
      tags: { component: 'shortlinks', op: 'recordClick' },
      extra: {
        code: input.code,
        campaign: input.resolution.campaign,
        platform: input.resolution.platform,
      },
    })
  }
}
