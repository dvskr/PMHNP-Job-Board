import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { safeInternalPath } from '@/lib/auth/safe-redirect'
import { logger } from '@/lib/logger'

/**
 * POST /api/auth/verify-confirmation
 *
 * WHY THIS EXISTS
 * Supabase confirmation and recovery links are SINGLE USE and are spent by a
 * plain GET. Anything that opens the URL before the human does burns it, and
 * the recipient then sees "invalid or has expired" with no way forward. A
 * request for a fresh link also invalidates the previous one, so a user who
 * clicks Resend a few times and then opens an older email hits the same error
 * repeatedly. That combination stranded real signups, including an employer
 * who requested four links in half an hour and only got in on the newest.
 *
 * So verification must not happen on a GET. The emailed URL points at
 * /auth/confirm carrying the hashed token, that page renders a button, and the
 * token is redeemed only here, on an explicit POST.
 *
 * Security notes:
 *  - Rate limited on the shared auth bucket.
 *  - Never logs the token or the email address (a prior commit removed PII from
 *    this surface; do not regress it).
 *  - Responses do not distinguish "no such token" from "already used" or
 *    "wrong email", so this cannot be used to probe which addresses exist.
 *  - The post-verify destination is re-validated as a same-origin path, so a
 *    crafted redirectTo cannot turn this into an open redirect.
 */
export async function POST(request: NextRequest) {
  const rateLimitResult = await rateLimit(request, 'verifyConfirmation', RATE_LIMITS.auth)
  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json().catch(() => null)
    const tokenHash = typeof body?.token_hash === 'string' ? body.token_hash.trim() : ''
    const rawType = typeof body?.type === 'string' ? body.type : 'magiclink'
    const nextPath = safeInternalPath(body?.redirectTo, '/dashboard')

    if (!tokenHash) {
      return NextResponse.json({ error: 'Missing confirmation token' }, { status: 400 })
    }

    // Allow-list the OTP type. Supabase accepts several; we only ever mint
    // magiclink (signup confirmation), signup, email_change and recovery.
    const ALLOWED = ['magiclink', 'signup', 'email', 'email_change', 'recovery'] as const
    type AllowedType = (typeof ALLOWED)[number]
    const type: AllowedType = (ALLOWED as readonly string[]).includes(rawType)
      ? (rawType as AllowedType)
      : 'magiclink'

    const supabase = await createClient()
    // verifyOtp both consumes the token AND sets the session cookies through
    // the SSR client, so the user is logged in when they land.
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    })

    if (error || !data?.session) {
      // Deliberately coarse: one message for expired, already-used, and
      // malformed. `expired: true` only drives which copy the page shows.
      logger.warn('Confirmation verification rejected', {
        reason: error?.message ?? 'no session returned',
      })
      return NextResponse.json(
        {
          error: 'This confirmation link is no longer valid.',
          expired: true,
        },
        { status: 400 },
      )
    }

    return NextResponse.json({
      success: true,
      // 'recovery' means a password reset, which must land on the reset form
      // rather than the dashboard.
      redirectTo: type === 'recovery' ? '/reset-password' : nextPath,
      isRecovery: type === 'recovery',
      email: data.session.user.email ?? null,
    })
  } catch (err) {
    logger.error('Unexpected error verifying confirmation', err)
    return NextResponse.json({ error: 'Could not confirm your email. Please try again.' }, { status: 500 })
  }
}
