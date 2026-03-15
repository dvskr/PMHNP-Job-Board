import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { emailShell, headerBlock, primaryButton, escapeHtml } from '@/lib/email-service'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com'
const EMAIL_FROM = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>'

/**
 * POST /api/auth/send-confirmation
 * 
 * Bypasses Supabase's broken email sending by:
 * 1. Using Supabase admin API to generate the magic link
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
    // magiclink type verifies the user's email when clicked
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
      options: {
        redirectTo: `${BASE_URL}/auth/confirm`,
      },
    })

    if (error) {
      logger.error('Failed to generate confirmation link', error)
      return NextResponse.json({ error: 'Failed to send confirmation email' }, { status: 500 })
    }

    if (!data?.properties?.action_link) {
      logger.error('No action_link in generateLink response', data)
      return NextResponse.json({ error: 'Failed to generate confirmation link' }, { status: 500 })
    }

    const confirmationUrl = data.properties.action_link
    logger.info('Generated confirmation link', { email: normalizedEmail, url: confirmationUrl })

    // Build email using the shared design system
    const html = emailShell(`
          ${headerBlock('Confirm Your Email', 'One click to activate your account')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              <p style="margin: 0 0 24px; font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #E2E8F0; line-height: 1.7;">
                Thanks for signing up for PMHNP Hiring! Please confirm your email address by clicking the button below.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto 24px;">
                <tr>
                  <td>
                    ${primaryButton('✓ Confirm My Email', confirmationUrl)}
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #94A3B8; line-height: 1.6;">
                If the button doesn't work, try opening this email on a different device or browser.
              </p>
            </td>
          </tr>`,
      `<p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #64748B;">
        If you didn't create this account, you can safely ignore this email.
      </p>`,
      'Confirm your PMHNP Hiring account — one click to activate!'
    )

    // Send via Resend and log to EmailSend
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: normalizedEmail,
      replyTo: 'hello@pmhnphiring.com',
      subject: 'Confirm your PMHNP Hiring account',
      html,
    })

    // Log the send
    try {
      await prisma.emailSend.create({
        data: {
          resendId: result?.data?.id ?? null,
          to: normalizedEmail,
          subject: 'Confirm your PMHNP Hiring account',
          emailType: 'confirmation',
        },
      })
    } catch (logErr) {
      logger.error('Failed to log confirmation email send', logErr)
    }

    logger.info('Confirmation email sent via Resend', { email: normalizedEmail })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Error in send-confirmation', error)
    return NextResponse.json({ error: 'Failed to send confirmation email' }, { status: 500 })
  }
}
