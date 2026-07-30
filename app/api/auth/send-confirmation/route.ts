import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import {
  emailShellV2, headerBlockV2, primaryButtonV2,
  spacerV2, closeContentV2, noteCardV2,
  V2, SANS, SERIF,
} from '@/lib/email-templates-v2'
import { sendAndLog } from '@/lib/email-service'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com'

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

    // DO NOT email data.properties.action_link. That is a Supabase
    // /auth/v1/verify?token=... URL which is SINGLE USE and is spent by a plain
    // GET, so anything that opens it before the recipient does burns it and they
    // see "invalid or has expired". Generating a new link also invalidates the
    // previous one, so a user with several resend emails in their inbox hits
    // that error on every older link.
    //
    // Instead we email our own /auth/confirm carrying the hashed token. That
    // page is inert on GET and only verifies on an explicit button POST, so
    // nothing in transit can consume the token.
    const hashedToken = data?.properties?.hashed_token
    if (!hashedToken) {
      logger.error('No hashed_token in generateLink response', {
        hasProperties: !!data?.properties,
      })
      return NextResponse.json({ error: 'Failed to generate confirmation link' }, { status: 500 })
    }

    const confirmationUrl =
      `${BASE_URL}/auth/confirm`
      + `?token_hash=${encodeURIComponent(hashedToken)}`
      + `&type=magiclink`
      // Carried so the page's "send me a new link" button has an address to
      // use if the token turns out to be stale. Not a secret: the recipient
      // owns this mailbox, and send-confirmation is rate limited.
      + `&email=${encodeURIComponent(normalizedEmail)}`
    // Never log the token or the address: this surface was scrubbed of PII in
    // a prior commit and must stay that way.
    logger.info('Generated confirmation link')

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
          The button opens a page with one more Confirm step. That extra click is
          deliberate: it keeps corporate email scanners from using up your link
          before you get to it.
        </p>
      `)}
      ${spacerV2(48)}
      ${closeContentV2()}`,
      `<p style="margin:0;font-family:${SANS};font-size:12px;color:${V2.textMuted};">
        If you didn\u2019t create this account, you can safely ignore this email.
      </p>`,
      'Confirm your PMHNP Hiring account \u2014 one click to activate!'
    )

    // Account confirmation is transactional and required to use the platform —
    // we deliberately do NOT skip it for suppressed addresses (a suppressed user
    // re-signing up with the same email needs the confirm link to come through).
    await sendAndLog({
      from: '', // overridden by sendAndLog (transactional sender)
      to: normalizedEmail,
      subject: 'Confirm your PMHNP Hiring account',
      html,
    }, 'auth_confirm', { isSignup: true })

    logger.info('Confirmation email sent via Resend')

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Error in send-confirmation', error)
    return NextResponse.json({ error: 'Failed to send confirmation email' }, { status: 500 })
  }
}
