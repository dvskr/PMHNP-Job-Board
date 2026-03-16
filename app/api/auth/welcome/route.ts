import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendSignupWelcomeEmail } from '@/lib/email-service'
import { logger } from '@/lib/logger'

/**
 * POST /api/auth/welcome
 * 
 * Sends the welcome email after email confirmation.
 * Called from /auth/confirm after successful verification.
 * 
 * Protection against abuse:
 * 1. Dedup: only sends once per email (checks EmailSend table)
 * 2. Profile check: only sends to emails with existing UserProfile
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = body.email?.toLowerCase?.()?.trim?.()

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    // Must have a profile (proves they signed up)
    const profile = await prisma.userProfile.findFirst({
      where: { email },
      select: { firstName: true, role: true },
    })

    if (!profile) {
      return NextResponse.json({ sent: false, reason: 'no_profile' })
    }

    // Dedup — check if welcome email was already sent
    const alreadySent = await prisma.emailSend.findFirst({
      where: { to: email, emailType: 'welcome_signup' },
    })

    if (alreadySent) {
      return NextResponse.json({ sent: false, reason: 'already_sent' })
    }

    await sendSignupWelcomeEmail(email, profile.firstName || '', profile.role || 'job_seeker')
    logger.info('Welcome email sent after email confirmation', { email, role: profile.role })

    return NextResponse.json({ sent: true })
  } catch (error) {
    logger.error('Error sending post-confirmation welcome email', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
