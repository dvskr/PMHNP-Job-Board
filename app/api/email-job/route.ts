import { NextRequest, NextResponse } from 'next/server'
import { emailShell, headerBlock, primaryButton, secondaryButton, infoCard } from '@/lib/email-service'
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

    const html = emailShell(`
          ${headerBlock('Job Saved for You 📌', 'View it anytime from this email')}
          <tr>
            <td style="padding: 32px 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #e2e8f0; line-height: 1.7;">
                You saved this job to review later. Click below to view the full listing and apply.
              </p>
              ${infoCard(`
                    <p style="margin: 0 0 4px 0; font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Job Title</p>
                    <p style="margin: 0; font-size: 20px; font-weight: 700; color: #f1f5f9; letter-spacing: -0.2px;">${jobTitle}</p>
              `, '#10b981')}
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
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
      `<p style="margin: 8px 0 0 0; font-size: 11px; color: #475569;">
            <a href="${BASE_URL}/job-alerts" style="color: #64748b; text-decoration: none;">Set up job alerts</a>
            &nbsp;·&nbsp;
            <a href="mailto:hello@pmhnphiring.com" style="color: #64748b; text-decoration: none;">Contact us</a>
          </p>`
    )

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: `📌 Saved: ${jobTitle}`,
      html,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Email job error:', error)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}
