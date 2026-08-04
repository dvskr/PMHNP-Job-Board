import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import { slugify } from '@/lib/utils'
import { isEmailSuppressed, getOrCreateUnsubToken } from '@/lib/email-service'
import {
  interpretResendBatch,
  buildJobAlertEmailRows,
  type BatchOutcome,
  type ResendBatchResponse,
} from '@/lib/email/batch-send-result'
import { oneClickUnsubscribeUrl } from '@/lib/email/list-unsubscribe'
import {
  emailShellV2, headerBlockV2,
  primaryButtonV2, secondaryButtonV2, spacerV2, closeContentV2,
  unsubscribeFooterV2, bodyTextV2,
  V2, SANS as SANS_V2, SERIF as SERIF_V2,
} from '@/lib/email-templates-v2'
import { Prisma } from '@prisma/client'
import { CATEGORY_FILTERS, CATEGORY_EXCLUSIONS } from '@/lib/filters'
import { logger } from '@/lib/logger'
import { brand } from '@/config/brand'
import { BEST_SORT_ORDER_BY, compareJobsBest } from '@/lib/utils/job-sort'
import { renderJobCardHtml } from '@/lib/utils/render-job-card'
import { classifyJob } from '@/lib/ai/job-classifier'
import {
  ATS_HOST_SUBSTRINGS,
  isEmployerPosting,
} from '@/lib/ai/recommendation-policy'
import { isoDateUtc, sortByJitteredScore } from '@/lib/utils/rotation'

// Pin up to 2 employer postings per recipient per send, rotated daily.
const EMPLOYER_PIN_COUNT = 2
// Bump fetch ceiling — the new direct-apply DB filter narrows ~50% of the
// corpus, and the pinning + employer cap reduce further. 60 leaves headroom
// for cross-alert dedup before we truncate to 10 cards in the email.
const PER_ALERT_FETCH_CAP = 60


const resend = new Resend(process.env.RESEND_API_KEY)
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || brand.baseUrl
const IMG = `${BASE_URL}/images/email`
const EMAIL_FROM = process.env.EMAIL_FROM_MARKETING || process.env.EMAIL_FROM || brand.email.marketingFrom
const EMAIL_REPLY_TO = brand.email.replyTo

// ─── State name → abbreviation map (for location matching) ────────────────────
const STATE_TO_CODE: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN',
  'mississippi': 'MS', 'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE',
  'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
  'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK', 'oregon': 'OR',
  'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA',
  'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
  'district of columbia': 'DC',
}

// Reverse map: code → full name
const CODE_TO_STATE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_TO_CODE).map(([name, code]) => [code, name])
)

// ─── Alert eligibility window (A2 fix) ────────────────────────────────────────
// The daily cron fires once every 24h at a fixed slot, but lastSentAt is
// stamped MINUTES AFTER the slot starts (query + render + Resend batch time).
// The old predicate compared `lastSentAt < now - 24h`, so an alert stamped at
// 13:31 yesterday was NOT eligible at 13:30 today — it silently skipped a full
// day, and the skew compounded (stamp drifts later on every successful send).
//
// Fix: shrink the window to 20h. Chosen over "stamp lastSentAt to the slot
// time" because it is a read-side constant with no write-path changes and no
// need to reconstruct the intended slot; the 4h slack absorbs stamp drift and
// cron jitter while still blocking a same-day double send (the cron only runs
// once per 24h). Weekly gets the same 4h slack for the same reason.
export const DAILY_ELIGIBILITY_HOURS = 20
export const WEEKLY_ELIGIBILITY_HOURS = 6 * 24 + 20 // 164h = 7 days minus the same 4h slack

const HOUR_MS = 60 * 60 * 1000

/**
 * Pure predicate mirroring buildAlertEligibilityWhere (which the daily cron
 * and the instant employer fan-out both query with). Exported so tests can
 * pin the exact cadence rule without a database.
 */
export function isAlertDue(
  alert: { frequency: string; lastSentAt: Date | null },
  now: Date,
): boolean {
  if (!alert.lastSentAt) return true
  if (alert.frequency === 'daily') {
    return alert.lastSentAt.getTime() < now.getTime() - DAILY_ELIGIBILITY_HOURS * HOUR_MS
  }
  if (alert.frequency === 'weekly') {
    return alert.lastSentAt.getTime() < now.getTime() - WEEKLY_ELIGIBILITY_HOURS * HOUR_MS
  }
  // Unknown frequency values were never selected by the old OR either.
  return false
}

/** Prisma WHERE for "active, double-opted-in, and due under its frequency". */
export function buildAlertEligibilityWhere(now: Date): Prisma.JobAlertWhereInput {
  const dailyCutoff = new Date(now.getTime() - DAILY_ELIGIBILITY_HOURS * HOUR_MS)
  const weeklyCutoff = new Date(now.getTime() - WEEKLY_ELIGIBILITY_HOURS * HOUR_MS)
  return {
    // Double opt-in: both flags must be set. Older rows are grandfathered by
    // the migration (confirmed_at = created_at).
    isActive: true,
    confirmedAt: { not: null },
    OR: [
      { lastSentAt: null },
      { frequency: 'daily', lastSentAt: { lt: dailyCutoff } },
      { frequency: 'weekly', lastSentAt: { lt: weeklyCutoff } },
    ],
  }
}

// ─── Job freshness gate (A3 fix: renewals re-enter the pool) ──────────────────
// The old gate was `createdAt > cutoff` only, so an employer post reached
// alert inboxes exactly once in its lifetime. A paid renewal (Stripe webhook
// extends expiresAt and stamps Job.lastRenewedAt) is a re-promotion of the
// posting and re-enters the freshness window here. lastRenewedAt is only ever
// written by the renewal flow, so no sourceType guard is needed.
export function buildJobFreshnessOr(cutoff: Date): Prisma.JobWhereInput {
  return {
    OR: [
      { createdAt: { gt: cutoff } },
      { lastRenewedAt: { gt: cutoff } },
    ],
  }
}

// ─── Pure single-job alert matcher (A4 instant fan-out) ───────────────────────
/** Job fields the matcher inspects. Subset of the Prisma Job row. */
export interface AlertMatchableJob {
  title: string
  employer: string
  location: string | null
  city: string | null
  state: string | null
  stateCode: string | null
  mode: string | null
  jobType: string | null
  isRemote: boolean
  isHybrid: boolean
  normalizedMinSalary: number | null
  normalizedMaxSalary: number | null
  newGradFriendly: boolean
  minYearsExperience: number | null
}

/** Alert criteria fields the matcher inspects. Subset of the JobAlert row. */
export interface AlertMatchCriteria {
  keyword?: string | null
  location?: string | null
  mode?: string | null
  jobType?: string | null
  minSalary?: number | null
  maxSalary?: number | null
  newGradFriendly?: boolean | null
  minYearsExperience?: number | null
}

/**
 * Inverts the per-alert WHERE builder in sendJobAlerts: instead of "which jobs
 * match this alert", answers "does THIS job match this alert". Each branch
 * mirrors the corresponding Prisma clause below — keep them in sync.
 *
 * One deliberate narrowing: the digest's newGradFriendly arm also ORs the
 * CATEGORY_FILTERS['new-grad'] title patterns (minus exclusions) to catch
 * unstructured aggregator rows. This matcher only ever sees employer posts,
 * which get structured newGradFriendly/minYearsExperience at write time
 * (lib/experience-label.ts), so the flag + min=0 check is sufficient here.
 */
export function jobMatchesAlert(job: AlertMatchableJob, alert: AlertMatchCriteria): boolean {
  const contains = (haystack: string | null | undefined, needle: string): boolean =>
    (haystack ?? '').toLowerCase().includes(needle.toLowerCase())

  // Keyword: title + employer only (description is too noisy).
  if (alert.keyword) {
    if (!contains(job.title, alert.keyword) && !contains(job.employer, alert.keyword)) return false
  }

  // Location: structured state/stateCode fields + freetext fallback.
  if (alert.location) {
    const locationLower = alert.location.toLowerCase().trim()
    const stateCode = STATE_TO_CODE[locationLower] || (locationLower.length === 2 ? locationLower.toUpperCase() : null)
    const stateName = stateCode ? (CODE_TO_STATE[stateCode] || null) : null
    if (stateCode) {
      const matchesState =
        job.stateCode === stateCode ||
        (job.state ?? '').toLowerCase() === stateCode.toLowerCase() ||
        (stateName ? contains(job.state, stateName) : false) ||
        contains(job.location, alert.location) ||
        contains(job.location, `, ${stateCode}`)
      if (!matchesState) return false
    } else {
      if (!contains(job.location, alert.location) && !contains(job.city, alert.location)) return false
    }
  }

  // Mode: inclusive matching + isRemote/isHybrid booleans.
  if (alert.mode) {
    const modeLower = alert.mode.toLowerCase()
    if (modeLower === 'remote') {
      if (!contains(job.mode, 'remote') && !job.isRemote) return false
    } else if (modeLower === 'hybrid') {
      if (!contains(job.mode, 'hybrid') && !job.isHybrid) return false
    } else {
      if (!contains(job.mode, alert.mode)) return false
    }
  }

  // Job type: exact match.
  if (alert.jobType && job.jobType !== alert.jobType) return false

  // Salary: range overlap, but INCLUDE jobs with no salary data.
  const hasNoSalaryData = job.normalizedMinSalary == null && job.normalizedMaxSalary == null
  if (alert.minSalary) {
    const meetsMin = job.normalizedMaxSalary != null && job.normalizedMaxSalary >= alert.minSalary
    if (!meetsMin && !hasNoSalaryData) return false
  }
  if (alert.maxSalary) {
    const meetsMax = job.normalizedMinSalary != null && job.normalizedMinSalary <= alert.maxSalary
    if (!meetsMax && !hasNoSalaryData) return false
  }

  // New-grad: structured flag or explicit zero-experience floor (see docblock).
  if (alert.newGradFriendly === true) {
    if (!(job.newGradFriendly === true || job.minYearsExperience === 0)) return false
  }

  // Candidate-qualifies semantics: alert holder has N years; job qualifies
  // when it requires ≤ N or doesn't specify.
  if (typeof alert.minYearsExperience === 'number' && alert.minYearsExperience >= 0) {
    if (!(job.minYearsExperience == null || job.minYearsExperience <= alert.minYearsExperience)) return false
  }

  return true
}

// ─── Build human-readable criteria summary ────────────────────────────────────
// Exported: /api/job-alerts POST reuses this to personalize the welcome email.
export function buildCriteriaSummary(alert: { keyword?: string | null; location?: string | null; mode?: string | null; jobType?: string | null; minSalary?: number | null; maxSalary?: number | null }): string {
  const parts: string[] = []
  if (alert.keyword) parts.push(`"${alert.keyword}"`)
  if (alert.location) parts.push(`in ${alert.location}`)
  if (alert.mode) parts.push(alert.mode)
  if (alert.jobType) parts.push(alert.jobType)
  if (alert.minSalary || alert.maxSalary) {
    const minK = alert.minSalary ? Math.round(alert.minSalary / 1000) : 0
    const maxK = alert.maxSalary ? Math.round(alert.maxSalary / 1000) : 0
    if (minK && maxK) parts.push(`$${minK}k–$${maxK}k`)
    else if (minK) parts.push(`$${minK}k+`)
    else parts.push(`up to $${maxK}k`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'All PMHNP jobs'
}

// ─── Build pre-filtered jobs URL from alert criteria ──────────────────────────
// Exported: /api/job-alerts POST reuses this for the welcome email CTA link.
export function buildFilteredJobsUrl(alert: { keyword?: string | null; location?: string | null; mode?: string | null; jobType?: string | null; minSalary?: number | null; maxSalary?: number | null }): string {
  // Param names MUST match parseFiltersFromParams (lib/filters.ts): the /jobs
  // page reads workMode/jobType/salaryMin — the old mode/type/minSalary/maxSalary
  // names were silently ignored, so "View All Matching Jobs" landed on an
  // unfiltered listing. There is no max-salary filter on /jobs, so maxSalary is
  // intentionally dropped.
  const params = new URLSearchParams()
  if (alert.keyword) params.set('q', alert.keyword)
  if (alert.location) params.set('location', alert.location)
  if (alert.mode) params.set('workMode', alert.mode.toLowerCase())
  if (alert.jobType) params.set('jobType', alert.jobType)
  if (alert.minSalary) params.set('salaryMin', String(alert.minSalary))
  const qs = params.toString()
  return qs ? `${BASE_URL}/jobs?${qs}` : `${BASE_URL}/jobs`
}

// ─── Time-ago helper ──────────────────────────────────────────────────────────
function timeAgo(date: Date): string {
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffH < 1) return 'Just posted'
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'Yesterday'
  if (diffD < 7) return `${diffD}d ago`
  return `${Math.floor(diffD / 7)}w ago`
}

// ─── Build a single alert email HTML (V2 Warm Diorama) ────────────────────────
/** Job fields the alert email card renderer reads. */
export interface AlertCardJob {
  id: string
  title: string
  employer: string
  location: string
  minSalary?: number | null
  maxSalary?: number | null
  normalizedMinSalary?: number | null
  normalizedMaxSalary?: number | null
  mode?: string | null
  jobType?: string | null
  isFeatured?: boolean
  applyOnPlatform?: boolean
  sourceType?: string | null
  createdAt: Date
}

function buildAlertHtml(
  jobs: AlertCardJob[],
  alertToken: string,
  criteriaText: string,
  filteredUrl: string,
  totalCount?: number
): string {
  const jobCount = totalCount || jobs.length
  const displayJobs = jobs.slice(0, 10)
  const jobCardsHtml = displayJobs.map((job, index) => {
    const minK = (job.normalizedMinSalary || job.minSalary) && (job.normalizedMinSalary || job.minSalary)! > 0 ? Math.round((job.normalizedMinSalary || job.minSalary)! / 1000) : 0
    const maxK = (job.normalizedMaxSalary || job.maxSalary) && (job.normalizedMaxSalary || job.maxSalary)! > 0 ? Math.round((job.normalizedMaxSalary || job.maxSalary)! / 1000) : 0
    const salaryText = minK && maxK ? `$${minK}k–$${maxK}k` : minK ? `$${minK}k+` : maxK ? `Up to $${maxK}k` : ''
    return renderJobCardHtml({
      title: job.title,
      employer: job.employer,
      location: job.location,
      jobType: job.jobType ?? null,
      mode: job.mode ?? null,
      isFeatured: job.isFeatured ?? null,
      applyOnPlatform: job.applyOnPlatform ?? null,
      sourceType: job.sourceType ?? null,
      salaryText,
      postedText: timeAgo(job.createdAt),
      jobUrl: `${BASE_URL}/jobs/${slugify(job.title, job.id)}`,
    }, index, index === displayJobs.length - 1)
  }).join('')

  return emailShellV2(`
      ${headerBlockV2(`${jobCount} New Job${jobCount > 1 ? 's' : ''} Match Your Alert`, '')}
      ${spacerV2(12)}
      ${bodyTextV2(`We found <strong>${jobCount} new position${jobCount > 1 ? 's' : ''}</strong> matching your preferences. Apply early for the best response rates.`)}
      ${spacerV2(8)}
      <tr><td style="padding:0 40px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${V2.bgCardAlt};border-radius:8px;border:1px solid ${V2.borderLight};">
          <tr><td style="padding:12px 16px;">
            <p style="margin:0;font-family:${SANS_V2};font-size:12px;color:${V2.textMuted};text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">Your Alert</p>
            <p style="margin:4px 0 0;font-family:${SANS_V2};font-size:14px;color:${V2.textBody};">${criteriaText}</p>
          </td></tr>
        </table>
      </td></tr>
      ${spacerV2(20)}
      ${jobCardsHtml}
      ${jobCount > displayJobs.length ? `${spacerV2(12)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        <p style="margin:0;font-family:${SANS_V2};font-size:13px;color:${V2.textMuted};">+ ${jobCount - displayJobs.length} more matching jobs</p>
      </td></tr>` : ''}
      ${spacerV2(28)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('View All Matching Jobs \u2192', filteredUrl)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
    `<p style="margin:0 0 4px;font-family:${SANS_V2};font-size:12px;color:${V2.textMuted};">
      <a href="${BASE_URL}/job-alerts/manage?token=${alertToken}" style="color:${V2.textMuted};text-decoration:underline;">Manage alert</a>
      &nbsp;&middot;&nbsp;
      <a href="${BASE_URL}/job-alerts/unsubscribe?token=${alertToken}" style="color:${V2.textMuted};text-decoration:underline;">Delete alert</a>
    </p>`,
    `${jobCount} new PMHNP jobs matching your alert — view them before they're filled!`
  )
}

// ─── HTML to plain text (for plain-text email fallback) ───────────────────────
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<a[^>]+href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&middot;/gi, '·')
    .replace(/&copy;/gi, '©')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─── Alert email payload builder ──────────────────────────────────────────────
export interface AlertEmailPayload {
  from: string
  to: string
  subject: string
  html: string
  text: string
  replyTo: string
  headers: Record<string, string>
}

/**
 * Compose the complete Resend payload for one alert email (from/replyTo,
 * V2 HTML, plain-text fallback, and the E1-correct List-Unsubscribe pair:
 * machine POST hits /api/one-click-unsubscribe with the EmailLead token,
 * human link hits the alert delete page with the JobAlert token).
 *
 * Shared by the daily digest below AND the instant employer fan-out
 * (lib/inngest/functions/employer-published.ts), so an instant single-job
 * email is byte-compatible with the daily digest instead of a second
 * hand-rolled template.
 */
export function buildAlertEmailPayload(args: {
  email: string
  alertToken: string
  /** EmailLead.unsubscribeToken (getOrCreateUnsubToken) — NOT the alert token. */
  oneClickToken: string
  criteriaText: string
  filteredUrl: string
  jobs: AlertCardJob[]
  totalCount: number
  subject: string
}): AlertEmailPayload {
  const unsubUrl = `${BASE_URL}/job-alerts/unsubscribe?token=${args.alertToken}`
  const oneClickUrl = oneClickUnsubscribeUrl(BASE_URL, args.oneClickToken)
  const html = buildAlertHtml(args.jobs, args.alertToken, args.criteriaText, args.filteredUrl, args.totalCount)
  return {
    from: EMAIL_FROM,
    to: args.email,
    subject: args.subject,
    html,
    text: htmlToPlainText(html),
    replyTo: EMAIL_REPLY_TO,
    headers: {
      // E1: machine-POST URL targets the real one-click endpoint; human page is the fallback.
      'List-Unsubscribe': `<${oneClickUrl}>, <${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
}

// ─── lastSentAt claim revert (claim-first send, see phase 2) ─────────────────
// updateMany cannot write per-row values, so group ids by their previous
// stamp. The `lastSentAt: claimValue` guard makes the revert a no-op for any
// row a concurrent writer touched in between.
async function revertLastSentAtClaim(
  alertIds: string[],
  prevLastSentAt: Map<string, Date | null>,
  claimValue: Date,
): Promise<void> {
  const groups = new Map<string, { prev: Date | null; ids: string[] }>()
  for (const id of alertIds) {
    const prev = prevLastSentAt.get(id) ?? null
    const key = prev ? prev.toISOString() : 'null'
    const entry = groups.get(key) ?? { prev, ids: [] }
    entry.ids.push(id)
    groups.set(key, entry)
  }
  try {
    await prisma.$transaction(
      Array.from(groups.values()).map(({ prev, ids }) =>
        prisma.jobAlert.updateMany({
          where: { id: { in: ids }, lastSentAt: claimValue },
          data: { lastSentAt: prev },
        }),
      ),
    )
  } catch (revertErr) {
    // Fail closed: the claim stays and these alerts skip one cycle. Never
    // retry into an unknown claim state — that is how duplicates happen.
    logger.error('[Alerts] Failed to revert lastSentAt claim; covered alerts skip one cycle', revertErr)
  }
}

// ─── Main service ─────────────────────────────────────────────────────────────

export interface SendJobAlertsOptions {
  /**
   * Restrict the run to alerts whose email matches one of these
   * (case-insensitive). The instant employer fan-out
   * (lib/inngest/functions/employer-published.ts) uses this to trigger an
   * EARLY full digest for just the matched recipients. Scoping by EMAIL,
   * not alert id, folds a recipient's other due alerts into the same send
   * and stamps them too, so the daily cron cannot email the same person a
   * second time that day.
   */
  restrictToEmails?: string[]
  /** Restrict to a single frequency ('daily' for the instant fan-out). */
  frequency?: 'daily' | 'weekly'
}

export async function sendJobAlerts(options: SendJobAlertsOptions = {}): Promise<{
  sent: number
  skipped: number
  suppressed: number
  errors: string[]
}> {
  const results = {
    sent: 0,
    skipped: 0,
    suppressed: 0,
    errors: [] as string[],
  }

  // An explicit empty restriction means "no recipients", not "everyone".
  if (options.restrictToEmails && options.restrictToEmails.length === 0) return results

  try {
    const now = new Date()

    // A2: 20h/164h eligibility windows via the shared builder — see the
    // comment on DAILY_ELIGIBILITY_HOURS for why 24h/7d raced the cron's
    // own lastSentAt stamp and silently skipped alerts on many days.
    const alerts = await prisma.jobAlert.findMany({
      where: {
        AND: [
          buildAlertEligibilityWhere(now),
          ...(options.frequency ? [{ frequency: options.frequency }] : []),
          ...(options.restrictToEmails
            ? [{ email: { in: options.restrictToEmails, mode: 'insensitive' as const } }]
            : []),
        ],
      },
    })

    logger.info(`[Alerts] Processing ${alerts.length} job alerts`)

    // Phase 1a: Run per-alert queries in parallel batches and collect raw results.
    //   We DON'T render HTML or build payloads yet — we need to dedupe matches across
    //   the same user's multiple alerts before composing a single consolidated email.
    type AlertJob = Awaited<ReturnType<typeof prisma.job.findMany>>[number]
    type AlertResult = {
      alert: typeof alerts[number]
      matchingJobs: AlertJob[]
      totalCount: number
    }
    const alertResults: AlertResult[] = []
    const suppressedEmails = new Set<string>()

    // Process alerts in parallel batches of 10 to avoid overwhelming the DB
    const QUERY_BATCH = 10
    for (let i = 0; i < alerts.length; i += QUERY_BATCH) {
      const batch = alerts.slice(i, i + QUERY_BATCH)

      const settled = await Promise.allSettled(batch.map(async (alert) => {
        // ── Suppression check ──
        // Cache per-email since many alerts can share an address.
        if (suppressedEmails.has(alert.email)) return null
        const suppressed = await isEmailSuppressed(alert.email)
        if (suppressed) {
          suppressedEmails.add(alert.email)
          results.suppressed++
          return null
        }

        // ── Build WHERE clause ──
        //
        // Freshness cutoff:
        //   - Subsequent sends: jobs created since lastSentAt (~24h or ~7d window depending on frequency).
        //   - FIRST send: clamp backfill to a max of 7 days. Without this clamp, an alert created
        //     30 days ago that finally fires today would surface 30 days of stale jobs in one
        //     "welcome" digest. Cap to 7 days so the first email looks like a recent-jobs snapshot.
        const FIRST_SEND_BACKFILL_DAYS = 7
        const cutoff = alert.lastSentAt
          ? alert.lastSentAt
          : new Date(Math.max(
              alert.createdAt.getTime(),
              now.getTime() - FIRST_SEND_BACKFILL_DAYS * 24 * 60 * 60 * 1000
            ))

        const whereClause: Prisma.JobWhereInput = {
          isPublished: true,
          AND: [
            // Freshness: created since the cutoff OR renewed since the cutoff
            // (A3 — paid renewals re-enter the pool; see buildJobFreshnessOr).
            buildJobFreshnessOr(cutoff),
            {
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: now } },
              ],
            },
            // Direct-apply only: every alert row must be either an employer
            // posting OR an aggregator job whose applyLink points to a known
            // ATS host. JS post-filter (classifyJob) catches edge cases
            // where the substring match was too loose. Mirrors the homepage
            // and dashboard recs — alerts never send aggregator-bounce links.
            {
              OR: [
                { sourceType: 'employer' },
                { sourceType: 'direct' },
                ...ATS_HOST_SUBSTRINGS.map((host) => ({
                  applyLink: { contains: host, mode: 'insensitive' as const },
                })),
              ],
            },
          ],
        }

        // ── Keyword: title + employer only (description is too noisy) ──
        if (alert.keyword) {
          (whereClause.AND as Prisma.JobWhereInput[]).push({
            OR: [
              { title: { contains: alert.keyword, mode: 'insensitive' } },
              { employer: { contains: alert.keyword, mode: 'insensitive' } },
            ],
          })
        }

        // ── Location: use structured state/stateCode fields + fallback to location string ──
        if (alert.location) {
          const locationLower = alert.location.toLowerCase().trim()
          const stateCode = STATE_TO_CODE[locationLower] || (locationLower.length === 2 ? locationLower.toUpperCase() : null)
          const stateName = stateCode ? (CODE_TO_STATE[stateCode] || null) : null

          if (stateCode) {
            // Match via structured fields OR freetext location
            ;(whereClause.AND as Prisma.JobWhereInput[]).push({
              OR: [
                { stateCode: stateCode },
                { state: { equals: stateCode, mode: 'insensitive' } },
                ...(stateName ? [{ state: { contains: stateName, mode: 'insensitive' as const } }] : []),
                { location: { contains: alert.location, mode: 'insensitive' } },
                { location: { contains: `, ${stateCode}`, mode: 'insensitive' } },
              ]
            })
          } else {
            // City or other location — freetext search + city field
            ;(whereClause.AND as Prisma.JobWhereInput[]).push({
              OR: [
                { location: { contains: alert.location, mode: 'insensitive' } },
                { city: { contains: alert.location, mode: 'insensitive' } },
              ]
            })
          }
        }

        // ── Mode: inclusive matching + isRemote boolean ──
        if (alert.mode) {
          const modeLower = alert.mode.toLowerCase()
          if (modeLower === 'remote') {
            ;(whereClause.AND as Prisma.JobWhereInput[]).push({
              OR: [
                { mode: { contains: 'remote', mode: 'insensitive' } },
                { isRemote: true },
              ]
            })
          } else if (modeLower === 'hybrid') {
            ;(whereClause.AND as Prisma.JobWhereInput[]).push({
              OR: [
                { mode: { contains: 'hybrid', mode: 'insensitive' } },
                { isHybrid: true },
              ]
            })
          } else {
            ;(whereClause.AND as Prisma.JobWhereInput[]).push({
              mode: { contains: alert.mode, mode: 'insensitive' },
            })
          }
        }

        // ── Job type: exact match ──
        if (alert.jobType) {
          whereClause.jobType = alert.jobType
        }

        // ── Salary: range overlap, but INCLUDE jobs with no salary data ──
        if (alert.minSalary) {
          ;(whereClause.AND as Prisma.JobWhereInput[]).push({
            OR: [
              { normalizedMaxSalary: { gte: alert.minSalary } },
              // Include jobs with no salary data — don't exclude unknowns
              { AND: [{ normalizedMinSalary: null }, { normalizedMaxSalary: null }] },
            ]
          })
        }
        if (alert.maxSalary) {
          ;(whereClause.AND as Prisma.JobWhereInput[]).push({
            OR: [
              { normalizedMinSalary: { lte: alert.maxSalary } },
              { AND: [{ normalizedMinSalary: null }, { normalizedMaxSalary: null }] },
            ]
          })
        }

        // Phase 5 #16 — experience filter alignment with /jobs UI.
        // 2026-05-16: tightened to match buildWhereClause exactly. Previous
        // implementation matched FEWER jobs than the live board (flag-only
        // for newGradFriendly, strict-N for minYearsExperience), so users
        // saw fewer jobs in the digest than when they clicked through.
        //
        // newGradFriendly: title-regex OR flag, minus exclusions (same as
        // /jobs?newGrad=1).
        if (alert.newGradFriendly === true) {
          const newGradCategoryOr = CATEGORY_FILTERS['new-grad'] ?? []
          ;(whereClause.AND as Prisma.JobWhereInput[]).push({
            OR: [
              { newGradFriendly: true },
              ...newGradCategoryOr,
            ],
          })
          for (const exclusion of CATEGORY_EXCLUSIONS['new-grad'] ?? []) {
            ;(whereClause.AND as Prisma.JobWhereInput[]).push({ NOT: exclusion })
          }
        }
        // minYearsExperience: candidate-qualifies semantics — the user has N
        // years and qualifies for any job where minYearsExperience ≤ N OR
        // doesn't specify (matches live board's null-branch fallback so
        // aggregated jobs without backfill aren't silently excluded).
        if (typeof alert.minYearsExperience === 'number' && alert.minYearsExperience >= 0) {
          ;(whereClause.AND as Prisma.JobWhereInput[]).push({
            OR: [
              { minYearsExperience: { lte: alert.minYearsExperience } },
              { minYearsExperience: null },
            ],
          })
        }

        // Get total count first, then fetch top 10 for the email.
        // We fetch a few extra (top 20) so that when merging across a user's
        // multiple alerts we still have headroom after dedup before truncating to 10.
        const totalCount = await prisma.job.count({ where: whereClause })

        if (totalCount > 0) {
          // Fetch PER_ALERT_FETCH_CAP rows so cross-alert dedup, JS-side
          // direct-apply filtering, and employer-pinning all have headroom
          // before we truncate to the 10-card display cap. Sort uses the
          // canonical BEST_SORT_ORDER_BY (lib/utils/job-sort.ts) so email
          // ordering matches the website's `best` sort exactly.
          const matchingJobs = await prisma.job.findMany({
            where: whereClause,
            orderBy: BEST_SORT_ORDER_BY,
            take: PER_ALERT_FETCH_CAP,
          })

          // Belt-and-braces: drop anything the DB filter let through that
          // classifyJob still considers external/unhealthy.
          const filtered = matchingJobs.filter((j) => {
            const { tier, isHealthy } = classifyJob(j)
            return isHealthy && tier !== 'external'
          })

          if (filtered.length === 0) return null
          return { alert, matchingJobs: filtered, totalCount: filtered.length } satisfies AlertResult
        }
        return null // no matching jobs
      }))

      for (const result of settled) {
        if (result.status === 'fulfilled' && result.value) {
          alertResults.push(result.value)
        } else if (result.status === 'fulfilled' && !result.value) {
          results.skipped++
        } else if (result.status === 'rejected') {
          results.errors.push(`Alert query failed: ${result.reason}`)
        }
      }
    }

    // Phase 1b: Group alerts by recipient email and merge their matches.
    //   A user with N triggered alerts gets ONE email with deduped jobs across
    //   all their alerts, NOT N separate emails. Fixes the multi-alert dedup bug.
    const byEmail = new Map<string, AlertResult[]>()
    for (const r of alertResults) {
      const key = r.alert.email.toLowerCase().trim()
      const list = byEmail.get(key) ?? []
      list.push(r)
      byEmail.set(key, list)
    }

    const emailPayloads: Array<{
      alertIds: string[]
      email: string
      payload: AlertEmailPayload
    }> = []

    for (const [, group] of byEmail) {
      // Merge matchingJobs across all alerts for this user, dedupe by job ID.
      const seen = new Set<string>()
      const merged: AlertJob[] = []
      let totalAcrossAlerts = 0
      for (const r of group) {
        totalAcrossAlerts += r.totalCount
        for (const j of r.matchingJobs) {
          if (!seen.has(j.id)) {
            seen.add(j.id)
            merged.push(j)
          }
        }
      }

      // ── Re-sort merged list to match the website's `best` sort ──
      // Each per-alert list is already in DB order, but cross-alert dedup may have
      // interleaved them. Re-apply the canonical comparator so the email ordering
      // matches what users see at /jobs?sort=best.
      merged.sort(compareJobsBest)

      // ── Employer-posting pinning ──
      // Pin up to EMPLOYER_PIN_COUNT employer postings at the top of the
      // digest, rotated daily per recipient. Two recipients with overlapping
      // alerts on the same day still see different employer postings because
      // the seed includes their email. Same recipient on the next day sees
      // a different rotation. Within rotation, qualityScore breaks ties.
      const primaryEmail = group[0].alert.email.toLowerCase().trim()
      const rotationSeed = `alerts-${isoDateUtc()}-${primaryEmail}`
      const employerPool = merged.filter((j) => isEmployerPosting(j))
      const pinnedRaw = sortByJitteredScore(
        employerPool,
        (j) => j.qualityScore ?? 0,
        (j) => j.id,
        rotationSeed,
      ).slice(0, EMPLOYER_PIN_COUNT)
      const pinnedIds = new Set(pinnedRaw.map((j) => j.id))

      // Reorder: pinned employer postings first, then the rest in `best` order.
      const ordered: AlertJob[] = [
        ...pinnedRaw,
        ...merged.filter((j) => !pinnedIds.has(j.id)),
      ]

      // ── Employer diversity pass ──
      // Without this, a single employer with many listings (e.g. MindPath Health
      // with 50 jobs across 50 cities) can fill every slot and make the email
      // feel like spam from one company. Cap each employer at 2 of the 10 cards.
      // If we can't fill 10 slots within the cap (narrow criteria, few employers),
      // fall back to overflow from the same employers so the user still sees
      // their full match count.
      const PER_EMPLOYER_CAP = 2
      const employerCounts = new Map<string, number>()
      const diversified: AlertJob[] = []
      const overflow: AlertJob[] = []
      for (const job of ordered) {
        const empKey = (job.employer || '').toLowerCase().trim()
        const count = employerCounts.get(empKey) ?? 0
        if (count < PER_EMPLOYER_CAP) {
          diversified.push(job)
          employerCounts.set(empKey, count + 1)
        } else {
          overflow.push(job)
        }
      }
      if (diversified.length < 10 && overflow.length > 0) {
        diversified.push(...overflow.slice(0, 10 - diversified.length))
      }

      const displayJobs = diversified.slice(0, 10)
      const dedupedTotal = merged.length

      // Combine criteria summaries for the "Your Alert(s)" box.
      const criteriaTexts = group.map(r => buildCriteriaSummary(r.alert)).filter(Boolean)
      const combinedCriteria = criteriaTexts.length > 1
        ? criteriaTexts.map((t, i) => `${i + 1}. ${t}`).join('  •  ')
        : criteriaTexts[0] || ''

      // Use the first alert's token for the manage/unsubscribe links.
      // If a user has multiple alerts they can navigate to manage all from there.
      const primary = group[0].alert
      // E1 fix: the one-click endpoint looks up EmailLead.unsubscribeToken, NOT
      // JobAlert.token — feed it the right token or the machine POST 200s into a no-op.
      const oneClickToken = await getOrCreateUnsubToken(primary.email)
      const alertWord = group.length > 1 ? 'Alerts' : 'Alert'
      const subject = `${dedupedTotal} New PMHNP Job${dedupedTotal > 1 ? 's' : ''} Match Your ${alertWord}`

      emailPayloads.push({
        alertIds: group.map(r => r.alert.id),
        email: primary.email,
        payload: buildAlertEmailPayload({
          email: primary.email,
          alertToken: primary.token,
          oneClickToken,
          criteriaText: combinedCriteria,
          filteredUrl: buildFilteredJobsUrl(primary),
          jobs: displayJobs,
          totalCount: dedupedTotal,
          subject,
        }),
      })
    }

    const dedupSavings = alertResults.length - emailPayloads.length
    logger.info(`[Alerts] ${emailPayloads.length} emails to send (${dedupSavings} dedup savings across multi-alert users), ${results.skipped} skipped (no matches), ${results.suppressed} suppressed`)

    if (emailPayloads.length === 0) return results

    // Phase 2: Send in batches via Resend Batch API (up to 100 per request).
    //
    // CADENCE HARD RULE — claim-first: lastSentAt is stamped BEFORE the batch
    // is handed to Resend. A crash between send and stamp can therefore only
    // mean a MISSED email (the alert skips one cycle; the next digest picks
    // up from the honest lastSentAt cutoff, so no matches are lost), never a
    // duplicate. The old stamp-after-send order meant a crash or DB blip
    // between the two re-sent the identical email to the whole batch on the
    // next cycle (or, in the Inngest fan-out path, on an immediate retry).
    // Failure handling after a claim:
    //   - Resend returned an error response (DEFINITIVE — nothing was sent):
    //     revert the claim so the alerts are re-selected next cycle.
    //   - The request threw mid-flight (AMBIGUOUS — it may have reached
    //     Resend): keep the claim. Fail closed: fewer emails, never doubles.
    const prevLastSentAt = new Map<string, Date | null>(alerts.map(a => [a.id, a.lastSentAt]))
    const BATCH_SIZE = 100
    for (let i = 0; i < emailPayloads.length; i += BATCH_SIZE) {
      const batch = emailPayloads.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1
      const totalBatches = Math.ceil(emailPayloads.length / BATCH_SIZE)

      logger.info(`[Alerts] Sending batch ${batchNum}/${totalBatches} (${batch.length} emails)`)

      // Claim every alert that contributes to this batch (across multi-alert
      // users). If the claim itself fails, skip the batch entirely — no email
      // may ever go out ahead of its stamp.
      const alertIds = batch.flatMap(b => b.alertIds)
      try {
        await prisma.jobAlert.updateMany({
          where: { id: { in: alertIds } },
          data: { lastSentAt: now },
        })
      } catch (claimErr) {
        const reason = claimErr instanceof Error ? claimErr.message : String(claimErr)
        for (const b of batch) {
          results.errors.push(`Alert(s) ${b.alertIds.join(',')} (${b.email}): lastSentAt claim failed, batch not sent: ${reason}`)
        }
        continue
      }

      // Retry with backoff on rate limits. Resend returns API errors in the
      // response (it does not throw), so capture the response and interpret it
      // — E2: this is how we recover the per-email message IDs and the real
      // success/failure state instead of assuming "sent".
      let ambiguousSendFailure = false
      let batchOutcome: BatchOutcome = { ok: false, reason: 'Rate limited after 3 retries' }
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await resend.batch.send(batch.map(b => b.payload))
          batchOutcome = interpretResendBatch(response as ResendBatchResponse)
          // A non-throwing API error is permanent (bad key, invalid payload) —
          // don't burn retries on it.
          break
        } catch (sendError: unknown) {
          const errMsg = sendError instanceof Error ? sendError.message : String(sendError)
          if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate')) {
            const backoff = (attempt + 1) * 3000 // 3s, 6s, 9s
            logger.warn(`[Alerts] Batch ${batchNum} rate limited, retrying in ${backoff}ms (${attempt + 1}/3)`)
            await new Promise(r => setTimeout(r, backoff))
          } else {
            // Non-rate-limit throw: fail THIS batch only (record it below) and let
            // the loop continue — a single bad batch must not abort all the rest.
            // The request may still have reached Resend, so the lastSentAt claim
            // is kept (see the claim-first comment above).
            batchOutcome = { ok: false, reason: errMsg }
            ambiguousSendFailure = true
            break
          }
        }
      }

      const emailRows = buildJobAlertEmailRows(
        batch.map(b => ({ email: b.email, subject: b.payload.subject })),
        batchOutcome,
      )

      if (batchOutcome.ok) {
        results.sent += batch.length
        logger.info(`[Alerts] Batch ${batchNum} sent successfully (${batch.length} emails, covering ${alertIds.length} alerts)`)
      } else {
        for (const b of batch) {
          results.errors.push(`Alert(s) ${b.alertIds.join(',')} (${b.email}): ${batchOutcome.reason}`)
        }
        if (ambiguousSendFailure) {
          logger.error(`[Alerts] Batch ${batchNum} failed ambiguously; lastSentAt claim kept so the covered alerts skip this cycle rather than risk a duplicate: ${batchOutcome.reason}`)
        } else {
          // Definitive rejection — nothing was sent. Release the claim so the
          // alerts are re-selected next cycle.
          await revertLastSentAtClaim(alertIds, prevLastSentAt, now)
        }
      }

      // Log each email's real outcome (with resendId on success) — non-blocking.
      try {
        await prisma.emailSend.createMany({ data: emailRows })
      } catch (logErr) {
        logger.error('Failed to log batch email sends', logErr)
      }

      // Small pause between batches to be safe
      if (i + BATCH_SIZE < emailPayloads.length) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    return results
  } catch (error) {
    logger.error('[Alerts] Job alerts service error', error)
    throw error
  }
}
