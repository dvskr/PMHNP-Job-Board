import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import { slugify } from '@/lib/utils'
import { isEmailSuppressed } from '@/lib/email-service'
import {
  emailShellV2, headerBlockV2,
  primaryButtonV2, secondaryButtonV2, spacerV2, closeContentV2,
  unsubscribeFooterV2, bodyTextV2,
  V2, SANS as SANS_V2, SERIF as SERIF_V2,
} from '@/lib/email-templates-v2'
import { Prisma } from '@prisma/client'
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

// ─── Build human-readable criteria summary ────────────────────────────────────
function buildCriteriaSummary(alert: { keyword?: string | null; location?: string | null; mode?: string | null; jobType?: string | null; minSalary?: number | null; maxSalary?: number | null }): string {
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
function buildFilteredJobsUrl(alert: { keyword?: string | null; location?: string | null; mode?: string | null; jobType?: string | null; minSalary?: number | null; maxSalary?: number | null }): string {
  const params = new URLSearchParams()
  if (alert.keyword) params.set('q', alert.keyword)
  if (alert.location) params.set('location', alert.location)
  if (alert.mode) params.set('mode', alert.mode)
  if (alert.jobType) params.set('type', alert.jobType)
  if (alert.minSalary) params.set('minSalary', String(alert.minSalary))
  if (alert.maxSalary) params.set('maxSalary', String(alert.maxSalary))
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
function buildAlertHtml(
  jobs: Array<{ id: string; title: string; employer: string; location: string; minSalary?: number | null; maxSalary?: number | null; normalizedMinSalary?: number | null; normalizedMaxSalary?: number | null; mode?: string | null; jobType?: string | null; isFeatured?: boolean; applyOnPlatform?: boolean; sourceType?: string | null; createdAt: Date }>,
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
function htmlToPlainText(html: string): string {
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

// ─── Main service ─────────────────────────────────────────────────────────────

export async function sendJobAlerts(): Promise<{
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

  try {
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const alerts = await prisma.jobAlert.findMany({
      where: {
        // Double opt-in: both flags must be set. Older rows
        // are grandfathered by the migration (confirmed_at = created_at).
        isActive: true,
        confirmedAt: { not: null },
        OR: [
          { lastSentAt: null },
          {
            frequency: 'daily',
            lastSentAt: { lt: oneDayAgo },
          },
          {
            frequency: 'weekly',
            lastSentAt: { lt: oneWeekAgo },
          },
        ],
      },
    })

    console.log(`[Alerts] Processing ${alerts.length} job alerts`)

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
          createdAt: { gt: cutoff },
          AND: [
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
        // newGradFriendly: when true, only jobs flagged open to new grads.
        if (alert.newGradFriendly === true) {
          ;(whereClause.AND as Prisma.JobWhereInput[]).push({ newGradFriendly: true })
        }
        // minYearsExperience: candidate-qualifies semantics — the user has N
        // years and qualifies for any job where minYearsExperience ≤ N.
        if (typeof alert.minYearsExperience === 'number' && alert.minYearsExperience >= 0) {
          ;(whereClause.AND as Prisma.JobWhereInput[]).push({
            minYearsExperience: { lte: alert.minYearsExperience },
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
      payload: { from: string; to: string; subject: string; html: string; text: string; replyTo: string; headers: Record<string, string> }
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
      const filteredUrl = buildFilteredJobsUrl(primary)
      const unsubUrl = `${BASE_URL}/job-alerts/unsubscribe?token=${primary.token}`
      const html = buildAlertHtml(displayJobs, primary.token, combinedCriteria, filteredUrl, dedupedTotal)
      const alertWord = group.length > 1 ? 'Alerts' : 'Alert'
      const subject = `${dedupedTotal} New PMHNP Job${dedupedTotal > 1 ? 's' : ''} Match Your ${alertWord}`

      emailPayloads.push({
        alertIds: group.map(r => r.alert.id),
        email: primary.email,
        payload: {
          from: EMAIL_FROM,
          to: primary.email,
          subject,
          html,
          text: htmlToPlainText(html),
          replyTo: EMAIL_REPLY_TO,
          headers: {
            'List-Unsubscribe': `<${unsubUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        },
      })
    }

    const dedupSavings = alertResults.length - emailPayloads.length
    console.log(`[Alerts] ${emailPayloads.length} emails to send (${dedupSavings} dedup savings across multi-alert users), ${results.skipped} skipped (no matches), ${results.suppressed} suppressed`)

    if (emailPayloads.length === 0) return results

    // Phase 2: Send in batches via Resend Batch API (up to 100 per request)
    const BATCH_SIZE = 100
    for (let i = 0; i < emailPayloads.length; i += BATCH_SIZE) {
      const batch = emailPayloads.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1
      const totalBatches = Math.ceil(emailPayloads.length / BATCH_SIZE)

      console.log(`[Alerts] Sending batch ${batchNum}/${totalBatches} (${batch.length} emails)`)

      // Retry with backoff on rate limits
      let sent = false
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await resend.batch.send(batch.map(b => b.payload))
          sent = true
          break
        } catch (sendError: unknown) {
          const errMsg = sendError instanceof Error ? sendError.message : String(sendError)
          if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate')) {
            const backoff = (attempt + 1) * 3000 // 3s, 6s, 9s
            console.log(`[Alerts] Batch ${batchNum} rate limited, retrying in ${backoff}ms (${attempt + 1}/3)`)
            await new Promise(r => setTimeout(r, backoff))
          } else {
            throw sendError
          }
        }
      }

      if (sent) {
        // Mark every alert that contributed to a sent email (across multi-alert users).
        const alertIds = batch.flatMap(b => b.alertIds)
        await prisma.jobAlert.updateMany({
          where: { id: { in: alertIds } },
          data: { lastSentAt: now },
        })
        results.sent += batch.length
        console.log(`[Alerts] Batch ${batchNum} sent successfully (${batch.length} emails, covering ${alertIds.length} alerts)`)

        // Log each batch send to EmailSend (non-blocking)
        try {
          await prisma.emailSend.createMany({
            data: batch.map(b => ({
              to: b.email,
              subject: b.payload.subject,
              emailType: 'job_alert',
            })),
          })
        } catch (logErr) {
          logger.error('Failed to log batch email sends', logErr)
        }
      } else {
        for (const b of batch) {
          results.errors.push(`Alert(s) ${b.alertIds.join(',')} (${b.email}): Rate limited after 3 retries`)
        }
      }

      // Small pause between batches to be safe
      if (i + BATCH_SIZE < emailPayloads.length) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    return results
  } catch (error) {
    console.error('[Alerts] Job alerts service error:', error)
    throw error
  }
}
