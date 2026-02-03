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
    const { supabaseId, email, firstName: rawFirstName, lastName: rawLastName, role, company: rawCompany, phone: rawPhone } = body

    const firstName = rawFirstName ? sanitizeText(rawFirstName, 50) : null
    const lastName = rawLastName ? sanitizeText(rawLastName, 50) : null
    const company = rawCompany ? sanitizeText(rawCompany, 100) : null
    const phone = rawPhone ? sanitizeText(rawPhone, 20) : null

    if (!supabaseId || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

    // Send welcome email only for new signups (not updates)
    if (!existingProfile) {
      try {
        await sendSignupWelcomeEmail(email, firstName, role || 'job_seeker')
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

