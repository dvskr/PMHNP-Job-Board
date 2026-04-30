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


const resend = new Resend(process.env.RESEND_API_KEY)
const BASE_URL = 'https://pmhnphiring.com'
const IMG = `${BASE_URL}/images/email`
const EMAIL_FROM = process.env.EMAIL_FROM_MARKETING || process.env.EMAIL_FROM || 'PMHNP Hiring <alerts@pmhnphiring.com>'
const EMAIL_REPLY_TO = 'hello@pmhnphiring.com'

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

// ─── V2 badge helper (local to this file) ─────────────────────────────────────
function v2Badge(text: string, bg: string, fg: string, border?: string): string {
  return `<span style="display:inline-block;padding:5px 14px;border-radius:20px;font-family:${SANS_V2};font-size:11px;font-weight:600;letter-spacing:0.3px;background:${bg};color:${fg};${border ? 'border:1px solid ' + border + ';' : ''}">${text}</span>`
}

// ─── Build a single alert email HTML (V2 Warm Diorama) ────────────────────────
function buildAlertHtml(
  jobs: Array<{ id: string; title: string; employer: string; location: string; minSalary?: number | null; maxSalary?: number | null; normalizedMinSalary?: number | null; normalizedMaxSalary?: number | null; mode?: string | null; isFeatured?: boolean; createdAt: Date }>,
  alertToken: string,
  criteriaText: string,
  filteredUrl: string,
  totalCount?: number
): string {
  const jobCount = totalCount || jobs.length
  const displayJobs = jobs.slice(0, 10)
  const COLORS = ['#4DB6AC', '#E8937A', '#7C8CF5', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4', '#10B981', '#F97316', '#6366F1']

  const jobCardsHtml = displayJobs.map((job, index) => {
    const jobUrl = `${BASE_URL}/jobs/${slugify(job.title, job.id)}`
    const color = COLORS[index % COLORS.length]
    const initial = job.employer.charAt(0).toUpperCase()
    const minK = (job.normalizedMinSalary || job.minSalary) && (job.normalizedMinSalary || job.minSalary)! > 0 ? Math.round((job.normalizedMinSalary || job.minSalary)! / 1000) : 0
    const maxK = (job.normalizedMaxSalary || job.maxSalary) && (job.normalizedMaxSalary || job.maxSalary)! > 0 ? Math.round((job.normalizedMaxSalary || job.maxSalary)! / 1000) : 0
    const salaryText = minK && maxK ? `$${minK}k\u2013$${maxK}k` : minK ? `$${minK}k+` : maxK ? `Up to $${maxK}k` : ''
    const postedText = timeAgo(job.createdAt)

    const badges: string[] = []
    badges.push(v2Badge(job.location, '#F3F6F4', '#374151', '#E0E5E1'))
    if (job.mode) badges.push(v2Badge(job.mode, job.mode.toLowerCase().includes('remote') ? '#ECFDF5' : '#F3F6F4', job.mode.toLowerCase().includes('remote') ? '#065F46' : '#374151', job.mode.toLowerCase().includes('remote') ? '#A7F3D0' : '#E0E5E1'))

    return `
        <tr><td style="padding:0 40px ${index < displayJobs.length - 1 ? '16px' : '0'};">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #E8ECE9;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
            <tr><td style="height:4px;background:${color};border-radius:14px 14px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td style="padding:24px 24px 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
                <td width="48" valign="top" style="padding-right:16px;">
                  <div style="width:48px;height:48px;border-radius:12px;background:${color};color:#fff;font-size:20px;font-weight:700;text-align:center;line-height:48px;">${initial}</div>
                </td>
                <td valign="top" style="width:100%;">
                  <a href="${jobUrl}" style="font-family:${SERIF_V2};font-size:18px;font-weight:700;color:${V2.textHeading};text-decoration:none;line-height:1.35;display:block;">${job.title}</a>
                  <p style="margin:4px 0 0;font-family:${SANS_V2};font-size:13px;font-weight:500;color:${V2.textMuted};">${job.employer} &middot; ${postedText}</p>
                </td>
                ${salaryText ? `<td valign="top" align="right" style="white-space:nowrap;padding-left:12px;">
                  <span style="display:inline-block;padding:6px 16px;border-radius:8px;font-family:${SANS_V2};font-size:14px;font-weight:700;background:#E6FAF8;color:#0d9488;">${salaryText}</span>
                </td>` : ''}
              </tr></table>
              ${badges.length > 0 ? `<div style="border-top:1px solid #F0F3F1;margin:16px 0;"></div>
              <table role="presentation" cellspacing="0" cellpadding="0"><tr>
                ${badges.map((b, i) => `<td${i < badges.length - 1 ? ' style="padding-right:6px;"' : ''}>${b}</td>`).join('')}
              </tr></table>` : ''}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;"><tr>
                <td align="right" valign="middle">
                  <table role="presentation" cellspacing="0" cellpadding="0"><tr>
                    <td style="padding-right:8px;">
                      <a href="${jobUrl}" style="display:inline-block;padding:8px 18px;border-radius:10px;font-family:${SANS_V2};font-size:13px;font-weight:600;color:#374151;background:#F3F6F4;border:1px solid #E0E5E1;text-decoration:none;">View Job &rarr;</a>
                    </td>
                    <td>
                      <a href="${jobUrl}" style="display:inline-block;padding:8px 20px;border-radius:10px;font-family:${SANS_V2};font-size:13px;font-weight:700;color:#fff;background:#0d9488;text-decoration:none;box-shadow:0 2px 6px rgba(13,148,136,0.25);">Apply Now</a>
                    </td>
                  </tr></table>
                </td>
              </tr></table>
            </td></tr>
          </table>
        </td></tr>`
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

    // Phase 1: Build all email payloads in parallel (no API calls yet)
    const emailPayloads: Array<{
      alertId: string
      email: string
      payload: { from: string; to: string; subject: string; html: string; text: string; replyTo: string; headers: Record<string, string> }
    }> = []

    // Process alerts in parallel batches of 10 to avoid overwhelming the DB
    const QUERY_BATCH = 10
    for (let i = 0; i < alerts.length; i += QUERY_BATCH) {
      const batch = alerts.slice(i, i + QUERY_BATCH)

      const settled = await Promise.allSettled(batch.map(async (alert) => {
        // ── Suppression check ──
        const suppressed = await isEmailSuppressed(alert.email)
        if (suppressed) {
          results.suppressed++
          return null
        }

        // ── Build WHERE clause ──
        const whereClause: Prisma.JobWhereInput = {
          isPublished: true,
          createdAt: { gt: alert.lastSentAt || alert.createdAt },
          AND: [
            {
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: now } },
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

        // Get total count first, then fetch top 10 for the email
        const totalCount = await prisma.job.count({ where: whereClause })

        if (totalCount > 0) {
          const matchingJobs = await prisma.job.findMany({
            where: whereClause,
            orderBy: [
              { isFeatured: 'desc' },
              { createdAt: 'desc' },
            ],
            take: 10,
          })

          const criteriaText = buildCriteriaSummary(alert)
          const filteredUrl = buildFilteredJobsUrl(alert)
          const unsubUrl = `${BASE_URL}/job-alerts/unsubscribe?token=${alert.token}`
          const html = buildAlertHtml(matchingJobs, alert.token, criteriaText, filteredUrl, totalCount)

          return {
            alertId: alert.id,
            email: alert.email,
            payload: {
              from: EMAIL_FROM,
              to: alert.email,
              subject: `${totalCount} New PMHNP Job${totalCount > 1 ? 's' : ''} Match Your Alert`,
              html,
              text: htmlToPlainText(html),
              replyTo: EMAIL_REPLY_TO,
              headers: {
                'List-Unsubscribe': `<${unsubUrl}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
            },
          }
        }
        return null // no matching jobs
      }))

      for (const result of settled) {
        if (result.status === 'fulfilled' && result.value) {
          emailPayloads.push(result.value)
        } else if (result.status === 'fulfilled' && !result.value) {
          results.skipped++
        } else if (result.status === 'rejected') {
          results.errors.push(`Alert query failed: ${result.reason}`)
        }
      }
    }

    console.log(`[Alerts] ${emailPayloads.length} emails to send, ${results.skipped} skipped (no matches), ${results.suppressed} suppressed`)

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
        // Mark all alerts in this batch as sent
        const alertIds = batch.map(b => b.alertId)
        await prisma.jobAlert.updateMany({
          where: { id: { in: alertIds } },
          data: { lastSentAt: now },
        })
        results.sent += batch.length
        console.log(`[Alerts] Batch ${batchNum} sent successfully (${batch.length} emails)`)

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
          results.errors.push(`Alert ${b.alertId} (${b.email}): Rate limited after 3 retries`)
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
