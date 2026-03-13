import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

const resend = new Resend(process.env.RESEND_API_KEY)
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com'
const EMAIL_FROM = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>'

/**
 * POST /api/auth/send-confirmation
 * 
 * Bypasses Supabase's broken email sending by:
 * 1. Using Supabase admin API to generate the confirmation link
 * 2. Sending the confirmation email ourselves via Resend
 */
export async function POST(request: NextRequest) {
  // Rate limit: 3 requests per 5 minutes per IP
  const rateLimitResult = await rateLimit(request, 'sendConfirmation', {
    limit: 3,
    windowSeconds: 300,
  })
  if (rateLimitResult) return rateLimitResult

  try {
    const { email } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    const supabaseAdmin = createAdminClient()

    // Generate the confirmation link via Supabase admin API
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email: normalizedEmail,
      options: {
        redirectTo: `${BASE_URL}/auth/callback`,
      },
    })

    if (error) {
      logger.error('Failed to generate confirmation link', error)
      // Don't expose internal errors to client
      return NextResponse.json({ error: 'Failed to send confirmation email' }, { status: 500 })
    }

    if (!data?.properties?.action_link) {
      logger.error('No action_link in generateLink response', data)
      return NextResponse.json({ error: 'Failed to generate confirmation link' }, { status: 500 })
    }

    const confirmationUrl = data.properties.action_link

    // Send the confirmation email via Resend
    await resend.emails.send({
      from: EMAIL_FROM,
      to: normalizedEmail,
      subject: 'Confirm your email — PMHNP Hiring',
      html: buildConfirmationEmailHtml(confirmationUrl),
    })

    logger.info('Confirmation email sent via Resend', { email: normalizedEmail })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Error in send-confirmation', error)
    return NextResponse.json({ error: 'Failed to send confirmation email' }, { status: 500 })
  }
}

function buildConfirmationEmailHtml(confirmationUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
</head>
<body style="margin: 0; padding: 0; background-color: #060E18; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #060E18;">
    <tr>
      <td align="center" style="padding: 40px 16px 32px;">
        <table role="presentation" width="580" cellspacing="0" cellpadding="0" style="max-width: 580px; width: 100%; background-color: #0F1923; border-radius: 16px; overflow: hidden; border: 1px solid #1E293B;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 28px 40px 24px; text-align: center; border-bottom: 1px solid #1E293B;">
              <div style="width: 64px; height: 64px; margin: 0 auto 14px; background-color: #FFFFFF; border-radius: 50%; padding: 2px;">
                <img src="${BASE_URL}/logo.png" width="60" height="60" alt="PMHNP Hiring" style="display: block; width: 60px; height: 60px; border-radius: 50%;" />
              </div>
              <h1 style="margin: 0; font-size: 22px; font-weight: bold; color: #F1F5F9; line-height: 1.3;">
                Confirm Your Email
              </h1>
              <p style="margin: 8px 0 0; font-size: 14px; color: #2DD4BF;">
                One click to activate your account
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px 40px;">
              <p style="margin: 0 0 24px; font-size: 15px; color: #E2E8F0; line-height: 1.7;">
                Thanks for signing up for PMHNP Hiring! Please confirm your email address by clicking the button below.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto 24px;">
                <tr>
                  <td>
                    <a href="${confirmationUrl}" style="display: inline-block; background: linear-gradient(135deg, #0D9488 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: bold; font-size: 15px; text-align: center;">
                      ✓ Confirm My Email
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 16px; font-size: 13px; color: #94A3B8; line-height: 1.6;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin: 0; font-size: 12px; color: #2DD4BF; word-break: break-all; line-height: 1.5;">
                <a href="${confirmationUrl}" style="color: #2DD4BF; text-decoration: none;">${confirmationUrl}</a>
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" width="580" cellspacing="0" cellpadding="0" style="max-width: 580px; width: 100%;">
          <tr>
            <td style="padding: 28px 20px 8px; text-align: center;">
              <p style="margin: 0 0 6px; font-size: 12px; color: #64748B;">
                If you didn't create this account, you can safely ignore this email.
              </p>
              <p style="margin: 12px 0 0; font-size: 11px; color: #475569;">
                &copy; ${new Date().getFullYear()} PMHNP Hiring · <a href="${BASE_URL}" style="color: #475569; text-decoration: none;">pmhnphiring.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
