import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import {
  emailShellV2, headerBlockV2, primaryButtonV2,
  spacerV2, closeContentV2, noteCardV2, contactFooterV2,
  V2, SANS, SERIF,
} from '@/lib/email-templates-v2'
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

    // Build email using the V2 Warm Diorama design system
    const html = emailShellV2(`
      ${headerBlockV2('Confirm Your Email', 'One click to activate your account')}
      ${spacerV2(8)}
      <tr><td class="content-pad" style="padding:0 40px;">
        <p style="margin:0 0 24px;font-family:${SERIF};font-size:19px;color:${V2.textBody};line-height:1.6;">
          Thanks for signing up for PMHNP Hiring! Please confirm your email address by clicking the button below.
        </p>
      </td></tr>
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('\u2713 Confirm My Email', confirmationUrl)}
      </td></tr>
      ${spacerV2(24)}
      ${noteCardV2(`
        <p style="margin:0;font-family:${SANS};font-size:13px;color:${V2.textMuted};line-height:1.6;">
          If the button doesn\u2019t work, try opening this email on a different device or browser.
        </p>
      `)}
      ${spacerV2(48)}
      ${closeContentV2()}`,
      `<p style="margin:0;font-family:${SANS};font-size:12px;color:${V2.textMuted};">
        If you didn\u2019t create this account, you can safely ignore this email.
      </p>`,
      'Confirm your PMHNP Hiring account \u2014 one click to activate!'
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
