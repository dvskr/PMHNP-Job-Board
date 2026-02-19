import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { sendSignupWelcomeEmail } from '@/lib/email-service'
import { logger } from '@/lib/logger'
import { sanitizeText, sanitizeUrl } from '@/lib/sanitize'

// Shared include for _count used by completeness scoring
const profileInclude = {
  _count: {
    select: {
      licenses: true,
      certificationRecords: true,
      education: true,
      workExperience: true,
      screeningAnswers: true,
      openEndedResponses: true,
      candidateReferences: true,
    },
  },
} as const

// GET - Get current user's profile
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let profile = await prisma.userProfile.findUnique({
      where: { supabaseId: user.id },
      include: profileInclude,
    })

    // Auto-create profile if it doesn't exist
    if (!profile && user.email) {
      // First check if a profile exists with this email (possibly under a different supabaseId)
      profile = await prisma.userProfile.findFirst({
        where: { email: user.email },
        include: profileInclude,
      })

      if (profile && profile.supabaseId !== user.id) {
        // Update the existing profile to point to the current supabase user
        profile = await prisma.userProfile.update({
          where: { id: profile.id },
          data: { supabaseId: user.id },
          include: profileInclude,
        })
      } else if (!profile) {
        // No profile exists at all — create one
        profile = await prisma.userProfile.create({
          data: {
            supabaseId: user.id,
            email: user.email,
            role: 'job_seeker',
          },
          include: profileInclude,
        })
      }
    }

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
      highlightsFrequency,
      newsletterOptIn
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

    // Create leads for new signups — job seekers go to email_leads, employers go to employer_leads
    if (!existingProfile) {
      try {
        if (role === 'employer') {
          // Employers go into employer_leads table
          const existingEmployerLead = await prisma.employerLead.findFirst({
            where: { contactEmail: email },
          })
          if (!existingEmployerLead) {
            await prisma.employerLead.create({
              data: {
                companyName: company || `${firstName || ''} ${lastName || ''}`.trim() || 'Unknown',
                contactEmail: email,
                contactName: [firstName, lastName].filter(Boolean).join(' ') || null,
                source: 'employer_signup',
                status: 'prospect',
              },
            })
          }
          logger.info('EmployerLead created for employer signup', { email })
        } else {
          // Job seekers go into email_leads table
          await prisma.emailLead.upsert({
            where: { email },
            update: {
              isSubscribed: true,
              newsletterOptIn: newsletterOptIn ? true : undefined,
            },
            create: {
              email,
              source: 'signup',
              isSubscribed: true,
              newsletterOptIn: !!newsletterOptIn,
            },
          })
          logger.info('EmailLead created for job seeker signup', { email })
        }
      } catch (leadError) {
        logger.error('Failed to create lead', leadError)
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

    // Sanitize basic fields
    const firstName = body.firstName ? sanitizeText(body.firstName, 50) : undefined
    const lastName = body.lastName ? sanitizeText(body.lastName, 50) : undefined
    const phone = body.phone ? sanitizeText(body.phone, 20) : undefined
    const company = body.company ? sanitizeText(body.company, 100) : undefined
    const avatarUrl = body.avatarUrl !== undefined ? (body.avatarUrl ? sanitizeUrl(body.avatarUrl) : null) : undefined
    const resumeUrl = body.resumeUrl !== undefined ? (body.resumeUrl ? sanitizeUrl(body.resumeUrl) : null) : undefined

    // Sanitize new PMHNP fields
    const headline = body.headline !== undefined ? (body.headline ? sanitizeText(body.headline, 120) : null) : undefined
    const bio = body.bio !== undefined ? (body.bio ? sanitizeText(body.bio, 500) : null) : undefined
    const certifications = body.certifications !== undefined ? (body.certifications ? sanitizeText(body.certifications, 500) : null) : undefined
    const licenseStates = body.licenseStates !== undefined ? (body.licenseStates ? sanitizeText(body.licenseStates, 500) : null) : undefined
    const specialties = body.specialties !== undefined ? (body.specialties ? sanitizeText(body.specialties, 500) : null) : undefined
    const preferredWorkMode = body.preferredWorkMode !== undefined ? (body.preferredWorkMode ? sanitizeText(body.preferredWorkMode, 30) : null) : undefined
    const preferredJobType = body.preferredJobType !== undefined ? (body.preferredJobType ? sanitizeText(body.preferredJobType, 30) : null) : undefined
    const linkedinUrl = body.linkedinUrl !== undefined ? (body.linkedinUrl ? sanitizeUrl(body.linkedinUrl) : null) : undefined

    // Integer fields
    const yearsExperience = body.yearsExperience !== undefined
      ? (body.yearsExperience !== null ? parseInt(String(body.yearsExperience), 10) || null : null)
      : undefined
    const desiredSalaryMin = body.desiredSalaryMin !== undefined
      ? (body.desiredSalaryMin !== null ? parseInt(String(body.desiredSalaryMin), 10) || null : null)
      : undefined
    const desiredSalaryMax = body.desiredSalaryMax !== undefined
      ? (body.desiredSalaryMax !== null ? parseInt(String(body.desiredSalaryMax), 10) || null : null)
      : undefined
    const desiredSalaryType = body.desiredSalaryType !== undefined
      ? (body.desiredSalaryType ? sanitizeText(body.desiredSalaryType, 20) : null)
      : undefined

    // Boolean fields
    const openToOffers = typeof body.openToOffers === 'boolean' ? body.openToOffers : undefined
    const profileVisible = typeof body.profileVisible === 'boolean' ? body.profileVisible : undefined

    // DateTime field
    const availableDate = body.availableDate !== undefined
      ? (body.availableDate ? new Date(body.availableDate) : null)
      : undefined

    const updatedProfile = await prisma.userProfile.update({
      where: { supabaseId: user.id },
      data: {
        ...(firstName !== undefined && { firstName: firstName || null }),
        ...(lastName !== undefined && { lastName: lastName || null }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(company !== undefined && { company: company || null }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(resumeUrl !== undefined && { resumeUrl }),
        ...(headline !== undefined && { headline }),
        ...(bio !== undefined && { bio }),
        ...(certifications !== undefined && { certifications }),
        ...(licenseStates !== undefined && { licenseStates }),
        ...(specialties !== undefined && { specialties }),
        ...(preferredWorkMode !== undefined && { preferredWorkMode }),
        ...(preferredJobType !== undefined && { preferredJobType }),
        ...(linkedinUrl !== undefined && { linkedinUrl }),
        ...(yearsExperience !== undefined && { yearsExperience }),
        ...(desiredSalaryMin !== undefined && { desiredSalaryMin }),
        ...(desiredSalaryMax !== undefined && { desiredSalaryMax }),
        ...(desiredSalaryType !== undefined && { desiredSalaryType }),
        ...(openToOffers !== undefined && { openToOffers }),
        ...(profileVisible !== undefined && { profileVisible }),
        ...(availableDate !== undefined && { availableDate }),
        updatedAt: new Date(),
      },
      include: profileInclude,
    })

    return NextResponse.json(updatedProfile)
  } catch (error) {
    logger.error('Profile PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

