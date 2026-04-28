import { NextRequest, NextResponse } from 'next/server'
import {
  emailShellV2, headerBlockV2, primaryButtonV2, secondaryButtonV2,
  spacerV2, closeContentV2, infoCardV2, V2, SANS, SERIF,
} from '@/lib/email-templates-v2'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const EMAIL_FROM = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>'
const BASE_URL = 'https://pmhnphiring.com'

/**
 * POST /api/email-job — Send job details to user's email
 */
export async function POST(request: NextRequest) {
  try {
    const { email, jobTitle, jobUrl } = await request.json()

    if (!email || !jobTitle) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const fullUrl = jobUrl?.startsWith('http') ? jobUrl : `${BASE_URL}${jobUrl}`

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
        <p style="margin:0;font-family:${SERIF};font-size:20px;font-weight:700;color:${V2.textHeading};">${jobTitle}</p>
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
        <a href="mailto:hello@pmhnphiring.com" style="color:${V2.textMuted};text-decoration:underline;">Contact us</a>
      </p>`,
      `You saved "${jobTitle}" — view the full listing and apply!`
    )

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: `Saved: ${jobTitle}`,
      html,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Email job error:', error)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}
