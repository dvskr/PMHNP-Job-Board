import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { sendSignupWelcomeEmail } from '@/lib/email-service'
import { logger } from '@/lib/logger'
import { sanitizeText, sanitizeUrl } from '@/lib/sanitize'

// GET - Get current user's profile
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await prisma.userProfile.findUnique({
      where: { supabaseId: user.id }
    })

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    return NextResponse.json(profile)
  } catch (error) {
    logger.error('Profile GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create profile (called during signup)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      supabaseId,
      email,
      firstName: rawFirstName,
      lastName: rawLastName,
      role,
      company: rawCompany,
      phone: rawPhone,
      wantJobHighlights,
      highlightsFrequency
    } = body

    const firstName = rawFirstName ? sanitizeText(rawFirstName, 50) : null
    const lastName = rawLastName ? sanitizeText(rawLastName, 50) : null
    const company = rawCompany ? sanitizeText(rawCompany, 100) : null
    const phone = rawPhone ? sanitizeText(rawPhone, 20) : null

    if (!supabaseId || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Block free email providers for employers
    if (role === 'employer') {
      const FREE_EMAIL_DOMAINS = [
        'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
        'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
        'ymail.com', 'live.com', 'msn.com', 'googlemail.com'
      ]

      const emailDomain = email.toLowerCase().split('@')[1]
      if (emailDomain && FREE_EMAIL_DOMAINS.includes(emailDomain)) {
        return NextResponse.json(
          { error: 'Please use your company email to sign up as an employer. Free email providers are not accepted.' },
          { status: 400 }
        )
      }
    }

    // Check if profile already exists
    const existingProfile = await prisma.userProfile.findUnique({
      where: { supabaseId }
    })

    const profile = await prisma.userProfile.upsert({
      where: { supabaseId },
      update: {
        firstName,
        lastName,
        role,
        company,
        phone,
      },
      create: {
        supabaseId,
        email,
        firstName,
        lastName,
        role: role || 'job_seeker',
        company,
        phone,
      }
    })

    // Create JobAlert if user opted in (only for new signups)
    if (!existingProfile && wantJobHighlights && role === 'job_seeker') {
      try {
        // Check if alert already exists for this email
        const existingAlert = await prisma.jobAlert.findFirst({
          where: { email }
        })

        if (!existingAlert) {
          await prisma.jobAlert.create({
            data: {
              email,
              name: 'Job Highlights',
              keyword: null,
              location: null,
              mode: null,
              jobType: null,
              minSalary: null,
              maxSalary: null,
              frequency: highlightsFrequency || 'daily',
              isActive: true,
              token: crypto.randomUUID(),
            }
          })
          logger.info('JobAlert created for new user', { email, frequency: highlightsFrequency })
        }
      } catch (alertError) {
        // Don't fail signup if alert creation fails
        logger.error('Failed to create JobAlert', alertError)
      }
    }

    // Send welcome email only for new signups (not updates)
    if (!existingProfile) {
      try {
        await sendSignupWelcomeEmail(email, firstName || '', role || 'job_seeker')
        logger.info('Welcome email sent to new user', { email, role })
      } catch (emailError) {
        // Don't fail signup if email fails
        logger.error('Failed to send welcome email', emailError)
      }
    }

    return NextResponse.json(profile)
  } catch (error) {
    logger.error('Profile POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Update profile fields
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { firstName: rawFirstName, lastName: rawLastName, phone: rawPhone, company: rawCompany, avatarUrl: rawAvatarUrl, resumeUrl: rawResumeUrl } = body

    const firstName = rawFirstName ? sanitizeText(rawFirstName, 50) : undefined
    const lastName = rawLastName ? sanitizeText(rawLastName, 50) : undefined
    const phone = rawPhone ? sanitizeText(rawPhone, 20) : undefined
    const company = rawCompany ? sanitizeText(rawCompany, 100) : undefined
    const avatarUrl = rawAvatarUrl ? sanitizeUrl(rawAvatarUrl) : undefined
    const resumeUrl = rawResumeUrl ? sanitizeUrl(rawResumeUrl) : undefined

    const updatedProfile = await prisma.userProfile.update({
      where: { supabaseId: user.id },
      data: {
        firstName: firstName || null,
        lastName: lastName || null,
        phone: phone || null,
        company: company || null,
        avatarUrl: avatarUrl !== undefined ? avatarUrl : undefined,
        resumeUrl: resumeUrl !== undefined ? resumeUrl : undefined,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json(updatedProfile)
  } catch (error) {
    logger.error('Profile PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

