import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import { slugify } from '@/lib/utils'
import { emailShell, headerBlock, primaryButton } from '@/lib/email-service'
import { Prisma } from '@prisma/client'


const resend = new Resend(process.env.RESEND_API_KEY)
const BASE_URL = 'https://pmhnphiring.com'
const EMAIL_FROM = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>'

// ─── Design tokens (same as email-service.ts) ────────────────────────────────
const F = "Arial, Helvetica, sans-serif"
const C = {
  bgBody: '#060E18', bgCard: '#0F1923', bgCardAlt: '#162231', bgElevated: '#1E293B',
  textPrimary: '#F1F5F9', textSecondary: '#E2E8F0', textMuted: '#94A3B8',
  textFaded: '#64748B', textDimmed: '#475569',
  teal: '#2DD4BF', tealDarker: '#0D9488', emeraldDark: '#059669', emerald: '#34D399',
  borderLight: '#1E293B', borderMed: '#334155',
}

// ─── Build a single alert email HTML ──────────────────────────────────────────
function buildAlertHtml(
  jobs: Array<{ id: string; title: string; employer: string; location: string; minSalary?: number | null; maxSalary?: number | null; mode?: string | null }>,
  alertToken: string
): string {
  const jobCount = jobs.length
  const displayJobs = jobs.slice(0, 10)

  const salaryBadge = (text: string) =>
    `<span style="display: inline-block; background-color: #064E3B; color: ${C.emerald}; padding: 3px 10px; border-radius: 6px; font-family: ${F}; font-size: 11px; font-weight: bold; border: 1px solid #065F46; line-height: 1.4;">${text}</span>`

  const jobListHtml = displayJobs.map((job, index) => {
    const jobUrl = `${BASE_URL}/jobs/${slugify(job.title, job.id)}`
    const isLast = index === displayJobs.length - 1
    const salaryText = job.minSalary ? `$${(job.minSalary / 1000).toFixed(0)}k${job.maxSalary ? ` – $${(job.maxSalary / 1000).toFixed(0)}k` : '+'}` : ''
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
          ${jobCount > 10 ? `
          <tr>
            <td class="content-pad" style="padding: 8px 40px 0;">
              <p style="margin: 0; font-family: ${F}; font-size: 13px; color: ${C.textMuted}; text-align: center;">
                + ${jobCount - 10} more matching jobs
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

    // Phase 1: Build all email payloads (no API calls yet)
    const emailPayloads: Array<{
      alertId: string
      email: string
      payload: { from: string; to: string; subject: string; html: string }
    }> = []

    for (const alert of alerts) {
      try {
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
          whereClause.location = { contains: alert.location, mode: 'insensitive' }
        }
        if (alert.mode) {
          whereClause.mode = alert.mode
        }
        if (alert.jobType) {
          whereClause.jobType = alert.jobType
        }
        if (alert.minSalary) {
          whereClause.minSalary = { gte: alert.minSalary }
        }

        const matchingJobs = await prisma.job.findMany({
          where: whereClause,
          orderBy: [
            { isFeatured: 'desc' },
            { createdAt: 'desc' },
          ],
          take: 10,
        })

        if (matchingJobs.length > 0) {
          const jobCount = matchingJobs.length
          const html = buildAlertHtml(matchingJobs, alert.token)

          emailPayloads.push({
            alertId: alert.id,
            email: alert.email,
            payload: {
              from: EMAIL_FROM,
              to: alert.email,
              subject: `🔔 ${jobCount} New PMHNP Job${jobCount > 1 ? 's' : ''} Match Your Alert`,
              html,
            },
          })
        } else {
          results.skipped++
        }
      } catch (alertError) {
        results.errors.push(`Alert ${alert.id} (${alert.email}): ${alertError}`)
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
