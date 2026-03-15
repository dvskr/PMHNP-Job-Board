import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { sendSignupWelcomeEmail } from '@/lib/email-service'
import { logger } from '@/lib/logger'

/**
 * POST /api/auth/welcome
 * 
 * Sends the welcome email after email confirmation.
 * Called from /auth/confirm after successful verification.
 * Deduplicates: checks EmailSend table to avoid sending twice.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Dedup — check if welcome email was already sent to this user
    const alreadySent = await prisma.emailSend.findFirst({
      where: {
        to: user.email,
        emailType: 'welcome_signup',
      },
    })

    if (alreadySent) {
      return NextResponse.json({ sent: false, reason: 'already_sent' })
    }

    // Get their profile for firstName and role
    const profile = await prisma.userProfile.findUnique({
      where: { supabaseId: user.id },
      select: { firstName: true, role: true },
    })

    const firstName = profile?.firstName || ''
    const role = profile?.role || 'job_seeker'

    await sendSignupWelcomeEmail(user.email, firstName, role)
    logger.info('Welcome email sent after email confirmation', { email: user.email, role })

    return NextResponse.json({ sent: true })
  } catch (error) {
    logger.error('Error sending post-confirmation welcome email', error)
    return NextResponse.json({ error: 'Failed to send welcome email' }, { status: 500 })
  }
}
