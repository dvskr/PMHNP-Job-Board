/**
 * GET /api/cron/weekly-newsletter — distribution audit A7 (BUILD ONLY).
 *
 * Composes a "new on the board" digest from the last 7 days of published
 * jobs, employer posts first (canonical buildJobsOrderBy('best') pinning),
 * rendered with the shared renderJobCardHtml cards. Audience: EmailLead rows
 * with newsletterOptIn=true that are not suppressed at either the lead or
 * profile level.
 *
 * ── OPERATOR GATE — DO NOT REMOVE ────────────────────────────────────────────
 * This route is deliberately NOT registered in vercel.json and refuses to run
 * unless ENABLE_WEEKLY_NEWSLETTER=true. Enabling the newsletter is a two-step
 * operator action:
 *   1. Set ENABLE_WEEKLY_NEWSLETTER=true in the Vercel environment.
 *   2. Register the cron in vercel.json, e.g.:
 *        { "path": "/api/cron/weekly-newsletter", "schedule": "0 15 * * 2" }
 * Neither ships by default, so no bulk send can ever fire from a deploy alone.
 */
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin'
import { sendCronFailureAlert } from '@/lib/discord-notifier'
import { withCronTracking } from '@/lib/cron/track'
import { buildJobsOrderBy } from '@/lib/utils/job-sort'
import { renderJobCardHtml } from '@/lib/utils/render-job-card'
import { buildJobFreshnessOr, htmlToPlainText } from '@/lib/job-alerts-service'
import { oneClickUnsubscribeUrl } from '@/lib/email/list-unsubscribe'
import { interpretResendBatch, type BatchOutcome, type ResendBatchResponse } from '@/lib/email/batch-send-result'
import {
  emailShellV2, headerBlockV2, bodyTextV2, spacerV2,
  primaryButtonV2, closeContentV2, SANS as SANS_V2, V2,
} from '@/lib/email-templates-v2'
import { brand } from '@/config/brand'
import { slugify } from '@/lib/utils'

export const maxDuration = 300 // 5 minutes — batched bulk send

const resend = new Resend(process.env.RESEND_API_KEY)
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || brand.baseUrl
const EMAIL_FROM = process.env.EMAIL_FROM_MARKETING || process.env.EMAIL_FROM || brand.email.marketingFrom
const EMAIL_REPLY_TO = brand.email.replyTo

const LOOKBACK_DAYS = 7
const DISPLAY_CAP = 10
const PER_EMPLOYER_CAP = 2
const FETCH_CAP = 40
const SEND_BATCH_SIZE = 100
const NEWSLETTER_SUBJECT = 'New PMHNP jobs on the board this week'
// Idempotency guard window: a duplicate trigger inside this window (second
// cron entry, manual admin re-run, platform re-invocation) must not re-send
// the bulk email to the full audience. 5 days still lets a normal weekly
// schedule (7 days apart) run, even if the operator moves the slot around.
const RESEND_GUARD_DAYS = 5

interface NewsletterJob {
  id: string
  title: string
  employer: string
  location: string
  jobType: string | null
  mode: string | null
  isFeatured: boolean
  applyOnPlatform: boolean
  sourceType: string | null
  normalizedMinSalary: number | null
  normalizedMaxSalary: number | null
  minSalary: number | null
  maxSalary: number | null
  createdAt: Date
}

function salaryText(job: NewsletterJob): string {
  const min = job.normalizedMinSalary || job.minSalary
  const max = job.normalizedMaxSalary || job.maxSalary
  const minK = min && min > 0 ? Math.round(min / 1000) : 0
  const maxK = max && max > 0 ? Math.round(max / 1000) : 0
  if (minK && maxK) return `$${minK}k to $${maxK}k`
  if (minK) return `$${minK}k+`
  if (maxK) return `Up to $${maxK}k`
  return ''
}

function postedText(createdAt: Date): string {
  const days = Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000))
  if (days < 1) return 'Posted today'
  if (days === 1) return 'Posted yesterday'
  return `Posted ${days}d ago`
}

function buildNewsletterHtml(jobs: NewsletterJob[], unsubscribeToken: string): string {
  const cards = jobs.map((job, index) => renderJobCardHtml({
    title: job.title,
    employer: job.employer,
    location: job.location,
    jobType: job.jobType,
    mode: job.mode,
    isFeatured: job.isFeatured,
    applyOnPlatform: job.applyOnPlatform,
    sourceType: job.sourceType,
    salaryText: salaryText(job),
    postedText: postedText(job.createdAt),
    jobUrl: `${BASE_URL}/jobs/${slugify(job.title, job.id)}`,
  }, index, index === jobs.length - 1)).join('')

  return emailShellV2(`
      ${headerBlockV2('New On The Board This Week', '')}
      ${spacerV2(12)}
      ${bodyTextV2(`Here are the newest PMHNP roles from the past week, with employer posted roles first. Apply early for the best response rates.`)}
      ${spacerV2(20)}
      ${cards}
      ${spacerV2(28)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('Browse All Jobs →', `${BASE_URL}/jobs`)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
    `<p style="margin:0 0 4px;font-family:${SANS_V2};font-size:12px;color:${V2.textMuted};">
      <a href="${BASE_URL}/email-preferences?token=${unsubscribeToken}" style="color:${V2.textMuted};text-decoration:underline;">Manage email preferences</a>
      &nbsp;&middot;&nbsp;
      <a href="${BASE_URL}/unsubscribe?token=${unsubscribeToken}" style="color:${V2.textMuted};text-decoration:underline;">Unsubscribe</a>
    </p>`,
    `The newest PMHNP jobs on the board this week`
  )
}

export async function GET(request: NextRequest) {
  const authError = await verifyCronOrAdmin(request)
  if (authError) return authError

  // OPERATOR GATE (see module docblock): without the env flag this route is
  // inert, and the cron itself is not registered — the operator must do both.
  if (process.env.ENABLE_WEEKLY_NEWSLETTER !== 'true') {
    return NextResponse.json({
      skipped: true,
      reason: 'ENABLE_WEEKLY_NEWSLETTER is not enabled',
    })
  }

  try {
    return await withCronTracking('weekly-newsletter', async () => {
      const now = new Date()

      // Idempotency guard (see RESEND_GUARD_DAYS): if a newsletter with this
      // subject was already SENT inside the window, a duplicate trigger is a
      // no-op instead of a second bulk send.
      const recentSend = await prisma.emailSend.findFirst({
        where: {
          emailType: 'broadcast',
          subject: NEWSLETTER_SUBJECT,
          status: 'sent',
          createdAt: { gt: new Date(now.getTime() - RESEND_GUARD_DAYS * 24 * 60 * 60 * 1000) },
        },
        select: { createdAt: true },
      })
      if (recentSend) {
        logger.info('[Newsletter] Skipping: newsletter already sent within the guard window', {
          lastSentAt: recentSend.createdAt.toISOString(),
        })
        return {
          response: NextResponse.json({ success: true, sent: 0, reason: 'already sent within the guard window' }),
          metrics: { sent: 0, audience: 0, jobs: 0 },
        }
      }

      const cutoff = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

      // New or renewed in the window, live, not expired — canonical 'best'
      // order pins employer posts above aggregated content.
      const fresh = await prisma.job.findMany({
        where: {
          isPublished: true,
          AND: [
            buildJobFreshnessOr(cutoff),
            { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          ],
        },
        orderBy: buildJobsOrderBy('best'),
        take: FETCH_CAP,
        select: {
          id: true, title: true, employer: true, location: true,
          jobType: true, mode: true, isFeatured: true, applyOnPlatform: true,
          sourceType: true, normalizedMinSalary: true, normalizedMaxSalary: true,
          minSalary: true, maxSalary: true, createdAt: true,
        },
      })

      // Employer diversity: cap each employer so one org cannot fill the digest.
      const employerCounts = new Map<string, number>()
      const jobs: NewsletterJob[] = []
      for (const job of fresh) {
        const key = (job.employer || '').toLowerCase().trim()
        const count = employerCounts.get(key) ?? 0
        if (count >= PER_EMPLOYER_CAP) continue
        employerCounts.set(key, count + 1)
        jobs.push(job)
        if (jobs.length >= DISPLAY_CAP) break
      }

      if (jobs.length === 0) {
        logger.info('[Newsletter] No fresh jobs in window; skipping send')
        return {
          response: NextResponse.json({ success: true, sent: 0, reason: 'no fresh jobs' }),
          metrics: { sent: 0, audience: 0, jobs: 0 },
        }
      }

      // Audience: newsletter opt-in, not suppressed at the lead level...
      const leads = await prisma.emailLead.findMany({
        where: { newsletterOptIn: true, isSuppressed: false },
        select: { email: true, unsubscribeToken: true },
      })
      // ...and not suppressed at the profile level either (bounce/complaint
      // flags can land on UserProfile.emailSuppressed instead of the lead).
      const suppressedProfiles = await prisma.userProfile.findMany({
        where: { email: { in: leads.map((l) => l.email) }, emailSuppressed: true },
        select: { email: true },
      })
      const suppressedSet = new Set(suppressedProfiles.map((p) => p.email.toLowerCase()))
      const audience = leads.filter((l) => !suppressedSet.has(l.email.toLowerCase()))

      if (audience.length === 0) {
        return {
          response: NextResponse.json({ success: true, sent: 0, reason: 'no audience' }),
          metrics: { sent: 0, audience: 0, jobs: jobs.length },
        }
      }

      const subject = NEWSLETTER_SUBJECT
      let sent = 0
      const errors: string[] = []

      for (let i = 0; i < audience.length; i += SEND_BATCH_SIZE) {
        const batch = audience.slice(i, i + SEND_BATCH_SIZE)
        const payloads = batch.map((lead) => {
          const html = buildNewsletterHtml(jobs, lead.unsubscribeToken)
          return {
            from: EMAIL_FROM,
            to: lead.email,
            subject,
            html,
            text: htmlToPlainText(html),
            replyTo: EMAIL_REPLY_TO,
            headers: {
              // EmailLead.unsubscribeToken is the token the one-click
              // endpoint expects, so RFC 8058 machine POSTs actually work.
              'List-Unsubscribe': `<${oneClickUnsubscribeUrl(BASE_URL, lead.unsubscribeToken)}>, <${BASE_URL}/unsubscribe?token=${lead.unsubscribeToken}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }
        })

        let outcome: BatchOutcome
        try {
          const response = await resend.batch.send(payloads)
          outcome = interpretResendBatch(response as ResendBatchResponse)
        } catch (sendErr) {
          outcome = { ok: false, reason: sendErr instanceof Error ? sendErr.message : String(sendErr) }
        }

        if (outcome.ok) {
          sent += batch.length
        } else {
          errors.push(outcome.reason)
        }

        // Log real outcomes (resendId on success) — non-blocking.
        try {
          await prisma.emailSend.createMany({
            data: batch.map((lead, idx) => ({
              to: lead.email,
              subject,
              emailType: 'broadcast',
              resendId: outcome.ok ? (outcome.ids[idx] ?? null) : null,
              status: outcome.ok ? 'sent' : 'failed',
            })),
          })
        } catch (logErr) {
          logger.error('[Newsletter] Failed to log email sends', logErr)
        }

        if (i + SEND_BATCH_SIZE < audience.length) {
          await new Promise((r) => setTimeout(r, 1000))
        }
      }

      logger.info('[Newsletter] Weekly newsletter complete', {
        sent, audience: audience.length, jobs: jobs.length, errors: errors.length,
      })

      return {
        response: NextResponse.json({ success: true, sent, audience: audience.length, jobs: jobs.length, errors }),
        metrics: { sent, audience: audience.length, jobs: jobs.length, errors: errors.length },
      }
    })
  } catch (error) {
    await sendCronFailureAlert('weekly-newsletter', error)
    logger.error('Cron weekly-newsletter error', error)
    return NextResponse.json({ error: 'Newsletter sending failed' }, { status: 500 })
  }
}
