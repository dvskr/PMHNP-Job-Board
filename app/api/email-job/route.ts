import { NextRequest, NextResponse } from 'next/server'
import {
  emailShellV2, headerBlockV2, primaryButtonV2, secondaryButtonV2,
  spacerV2, closeContentV2, infoCardV2, V2, SANS, SERIF,
} from '@/lib/email-templates-v2'
import { sendAndLog, isEmailSuppressed, getOrCreateUnsubToken, escapeHtml } from '@/lib/email-service'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

const BASE_URL = 'https://pmhnphiring.com'

/**
 * Resolve the user-supplied jobUrl to a same-origin link only. This route is
 * unauthenticated, so an attacker could otherwise point the CTA at an arbitrary
 * site and send phishing mail from our domain. We accept a relative path, or an
 * absolute URL only when it's on our own host; anything else falls back to /jobs.
 */
function safeJobUrl(jobUrl: unknown): string {
  if (typeof jobUrl !== 'string' || jobUrl.length === 0) return `${BASE_URL}/jobs`
  if (jobUrl.startsWith('/') && !jobUrl.startsWith('//')) return `${BASE_URL}${jobUrl}`
  try {
    const u = new URL(jobUrl)
    if (u.hostname === 'pmhnphiring.com' || u.hostname === 'www.pmhnphiring.com') return u.toString()
  } catch { /* not a valid absolute URL */ }
  return `${BASE_URL}/jobs`
}

/**
 * POST /api/email-job — Send job details to user's email
 */
export async function POST(request: NextRequest) {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'email-job', RATE_LIMITS.contact);
    if (rateLimitResult) return rateLimitResult;

  try {
    const { email, jobTitle, jobUrl } = await request.json()

    if (!email || !jobTitle) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Escape user-supplied title before it goes into HTML/subject, and clamp the
    // CTA to a same-origin URL — this route is unauthenticated.
    const safeTitle = escapeHtml(String(jobTitle))
    const fullUrl = safeJobUrl(jobUrl)

    const html = emailShellV2(`
      ${headerBlockV2('Job Saved for You', 'View it anytime from this email')}
      ${spacerV2(8)}
      <tr><td class="content-pad" style="padding:0 40px;">
        <p style="margin:0 0 20px;font-family:${SERIF};font-size:19px;color:${V2.textBody};line-height:1.6;">
          You saved this job to review later. Click below to view the full listing and apply.
        </p>
      </td></tr>
      ${infoCardV2(`
        <p style="margin:0 0 6px;font-family:${SANS};font-size:12px;color:${V2.textMuted};text-transform:uppercase;letter-spacing:1px;font-weight:700;">Job Title</p>
        <p style="margin:0;font-family:${SERIF};font-size:20px;font-weight:700;color:${V2.textHeading};">${safeTitle}</p>
      `, V2.teal)}
      ${spacerV2(24)}
      <tr><td class="content-pad" style="padding:0 40px;">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr class="stack">
          <td style="padding-right:12px;">${primaryButtonV2('View & Apply \u2192', fullUrl)}</td>
          <td>${secondaryButtonV2('Browse Jobs', `${BASE_URL}/jobs`)}</td>
        </tr></table>
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      `<p style="margin:0 0 4px;font-family:${SANS};font-size:12px;color:${V2.textMuted};">
        <a href="${BASE_URL}/job-alerts" style="color:${V2.textMuted};text-decoration:underline;">Set up job alerts</a>
        &nbsp;&middot;&nbsp;
        <a href="mailto:support@pmhnphiring.com" style="color:${V2.textMuted};text-decoration:underline;">Contact us</a>
      </p>`,
      `You saved "${safeTitle}" — view the full listing and apply!`
    )

    if (await isEmailSuppressed(email)) {
      return NextResponse.json({ success: true, suppressed: true })
    }

    const unsubToken = await getOrCreateUnsubToken(email)
    await sendAndLog({
      from: '', // overridden by sendAndLog based on emailType
      to: email,
      subject: `Saved: ${String(jobTitle).replace(/[\r\n]+/g, ' ').slice(0, 150)}`,
      html,
    }, 'email_job', { jobTitle }, `${BASE_URL}/unsubscribe?token=${unsubToken}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Email job error:', error)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}
