import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import { slugify } from '@/lib/utils'
import { emailShell, headerBlock, primaryButton, F, C } from '@/lib/email-service'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'


const resend = new Resend(process.env.RESEND_API_KEY)
const BASE_URL = 'https://pmhnphiring.com'
const EMAIL_FROM = process.env.EMAIL_FROM_MARKETING || process.env.EMAIL_FROM || 'PMHNP Hiring <alerts@pmhnphiring.com>'

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

// ─── Build a single alert email HTML ──────────────────────────────────────────
function buildAlertHtml(
  jobs: Array<{ id: string; title: string; employer: string; location: string; minSalary?: number | null; maxSalary?: number | null; mode?: string | null; isFeatured?: boolean }>,
  alertToken: string,
  totalCount?: number
): string {
  const jobCount = totalCount || jobs.length
  const displayJobs = jobs.slice(0, 10)

  const salaryBadge = (text: string) =>
    `<span style="display: inline-block; background-color: #064E3B; color: ${C.emerald}; padding: 3px 10px; border-radius: 6px; font-family: ${F}; font-size: 11px; font-weight: bold; border: 1px solid #065F46; line-height: 1.4;">${text}</span>`

  const jobListHtml = displayJobs.map((job, index) => {
    const jobUrl = `${BASE_URL}/jobs/${slugify(job.title, job.id)}`
    const isLast = index === displayJobs.length - 1
    const minK = job.minSalary && job.minSalary > 0 ? Math.round(job.minSalary / 1000) : 0
    const maxK = job.maxSalary && job.maxSalary > 0 ? Math.round(job.maxSalary / 1000) : 0
    const salaryText = minK && maxK ? `$${minK}k – $${maxK}k` : minK ? `$${minK}k+` : maxK ? `Up to $${maxK}k` : ''
    return `
      <tr>
        <td style="padding: 16px 20px;${!isLast ? ` border-bottom: 1px solid ${C.borderLight};` : ''}">
          <a href="${jobUrl}" style="color: ${C.teal}; text-decoration: none; font-family: ${F}; font-size: 15px; font-weight: bold; line-height: 1.4;">
            ${job.title}
          </a>
          <p style="margin: 4px 0 0; font-family: ${F}; font-size: 13px; color: ${C.textMuted};">
            ${job.employer} · ${job.location}${job.mode ? ` · ${job.mode}` : ''}
          </p>
          ${salaryText ? `<p style="margin: 8px 0 0;">${salaryBadge(salaryText)}</p>` : ''}
          ${job.isFeatured ? `<p style="margin: 6px 0 0;"><span style="display: inline-block; background-color: #312E81; color: #A5B4FC; padding: 2px 8px; border-radius: 4px; font-family: ${F}; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">⭐ FEATURED</span></p>` : ''}
        </td>
      </tr>`
  }).join('')

  return emailShell(`
          ${headerBlock(`${jobCount} New PMHNP Job${jobCount > 1 ? 's' : ''} Match Your Alert`)}
          <tr>
            <td class="content-pad" style="padding: 24px 40px 8px;">
              <p style="margin: 0; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.6;">
                New positions matching your criteria:
              </p>
            </td>
          </tr>
          <tr>
            <td class="content-pad" style="padding: 12px 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${C.bgCardAlt}; border: 1px solid ${C.borderLight}; border-radius: 12px; overflow: hidden;">
                ${jobListHtml}
              </table>
            </td>
          </tr>
          ${jobCount > displayJobs.length ? `
          <tr>
            <td class="content-pad" style="padding: 8px 40px 0;">
              <p style="margin: 0; font-family: ${F}; font-size: 13px; color: ${C.textMuted}; text-align: center;">
                + ${jobCount - displayJobs.length} more matching jobs
              </p>
            </td>
          </tr>` : ''}
          <tr>
            <td class="content-pad" style="padding: 24px 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                <tr>
                  <td>
                    ${primaryButton('View All Matching Jobs →', `${BASE_URL}/jobs`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
    `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
      <a href="${BASE_URL}/job-alerts/manage?token=${alertToken}" style="color: ${C.textFaded}; text-decoration: none;">Manage alert</a>
      &nbsp;·&nbsp;
      <a href="${BASE_URL}/job-alerts/unsubscribe?token=${alertToken}" style="color: ${C.textFaded}; text-decoration: none;">Delete alert</a>
    </p>`,
    `${jobCount} new PMHNP jobs matching your alert — view them before they're filled!`
  )
}

// ─── Main service ─────────────────────────────────────────────────────────────

export async function sendJobAlerts(): Promise<{
  sent: number
  skipped: number
  errors: string[]
}> {
  const results = {
    sent: 0,
    skipped: 0,
    errors: [] as string[],
  }

  try {
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const alerts = await prisma.jobAlert.findMany({
      where: {
        isActive: true,
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
      payload: { from: string; to: string; subject: string; html: string }
    }> = []

    // Process alerts in parallel batches of 10 to avoid overwhelming the DB
    const QUERY_BATCH = 10
    for (let i = 0; i < alerts.length; i += QUERY_BATCH) {
      const batch = alerts.slice(i, i + QUERY_BATCH)

      const settled = await Promise.allSettled(batch.map(async (alert) => {
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

        if (alert.keyword) {
          (whereClause.AND as Prisma.JobWhereInput[]).push({
            OR: [
              { title: { contains: alert.keyword, mode: 'insensitive' } },
              { description: { contains: alert.keyword, mode: 'insensitive' } },
              { employer: { contains: alert.keyword, mode: 'insensitive' } },
            ],
          })
        }
        if (alert.location) {
          // Check if user entered a full state name (e.g. "Florida") and expand to also match the code ("FL")
          const stateCode = STATE_TO_CODE[alert.location.toLowerCase().trim()]
          if (stateCode) {
            // Match either the full state name OR the state code in the location field
            ; (whereClause.AND as Prisma.JobWhereInput[]).push({
              OR: [
                { location: { contains: alert.location, mode: 'insensitive' } },
                { location: { contains: `, ${stateCode}`, mode: 'insensitive' } },
                { location: { contains: `${stateCode} `, mode: 'insensitive' } },
              ]
            })
          } else {
            whereClause.location = { contains: alert.location, mode: 'insensitive' }
          }
        }
        if (alert.mode) {
          whereClause.mode = alert.mode
        }
        if (alert.jobType) {
          whereClause.jobType = alert.jobType
        }
        if (alert.minSalary) {
          whereClause.normalizedMaxSalary = { gte: alert.minSalary }
        }
        if (alert.maxSalary) {
          whereClause.normalizedMinSalary = { lte: alert.maxSalary }
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

          const html = buildAlertHtml(matchingJobs, alert.token, totalCount)

          return {
            alertId: alert.id,
            email: alert.email,
            payload: {
              from: EMAIL_FROM,
              to: alert.email,
              subject: `🔔 ${totalCount} New PMHNP Job${totalCount > 1 ? 's' : ''} Match Your Alert`,
              html,
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

    console.log(`[Alerts] ${emailPayloads.length} emails to send, ${results.skipped} skipped (no matches)`)

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
