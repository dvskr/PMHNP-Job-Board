import { NextRequest, NextResponse } from 'next/server'
import { emailShell, headerBlock, primaryButton, secondaryButton, infoCard } from '@/lib/email-service'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const EMAIL_FROM = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>'
const BASE_URL = 'https://pmhnphiring.com'
const F = "Arial, Helvetica, sans-serif";

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

    const html = emailShell(`
          ${headerBlock('Job Saved for You', 'View it anytime from this email')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              <p style="margin: 0 0 20px 0; font-family: ${F}; font-size: 15px; color: #E2E8F0; line-height: 1.7;">
                You saved this job to review later. Click below to view the full listing and apply.
              </p>
              ${infoCard(`
                    <p style="margin: 0 0 6px 0; font-family: ${F}; font-size: 11px; color: #94A3B8; text-transform: uppercase; letter-spacing: 1px; font-weight: bold;">Job Title</p>
                    <p style="margin: 0; font-family: ${F}; font-size: 18px; font-weight: bold; color: #F1F5F9;">${jobTitle}</p>
              `, '#10B981')}
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr class="stack">
                  <td style="padding-right: 12px;">
                    ${primaryButton('View & Apply →', fullUrl)}
                  </td>
                  <td>
                    ${secondaryButton('Browse Jobs', `${BASE_URL}/jobs`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
      `<p style="margin: 8px 0 0 0; font-family: ${F}; font-size: 11px; color: #475569;">
            <a href="${BASE_URL}/job-alerts" style="color: #64748B; text-decoration: none;">Set up job alerts</a>
            &nbsp;·&nbsp;
            <a href="mailto:hello@pmhnphiring.com" style="color: #64748B; text-decoration: none;">Contact us</a>
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
