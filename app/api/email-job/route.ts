import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const EMAIL_FROM = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com'

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

        await resend.emails.send({
            from: EMAIL_FROM,
            to: email,
            subject: `📌 Saved: ${jobTitle}`,
            html: `
        <!DOCTYPE html>
        <html>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #0d9488; margin-bottom: 16px;">Your Saved Job</h2>
            <p style="font-size: 16px; margin-bottom: 4px;">You asked us to email you this job:</p>
            <h3 style="margin-bottom: 20px;">${jobTitle}</h3>
            <a href="${fullUrl}" style="display: inline-block; background: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">View & Apply →</a>
            <hr style="margin: 32px 0; border: none; border-top: 1px solid #e5e7eb;" />
            <p style="font-size: 13px; color: #6b7280;">
              <a href="${BASE_URL}/jobs" style="color: #0d9488;">Browse more PMHNP jobs</a> · 
              <a href="${BASE_URL}/job-alerts" style="color: #0d9488;">Set up job alerts</a>
            </p>
          </body>
        </html>
      `,
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Email job error:', error)
        return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
    }
}
