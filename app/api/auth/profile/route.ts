import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { sanitizeText, sanitizeUrl } from '@/lib/sanitize'
import { verifyCsrf } from '@/lib/csrf'
import { syncToBeehiiv } from '@/lib/beehiiv'
import { sendSignupWelcomeEmail } from '@/lib/email-service'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { inngest } from '@/lib/inngest/client'

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

    // Auto-create profile if it doesn't exist.
    //
    // Bug fix (2026-05-26): when email confirmation is required, the POST
    // call during signup fails with 401 because no session exists yet.
    // The first authenticated request after email confirmation lands here,
    // and this branch used to hardcode role='job_seeker' regardless of
    // what the user actually signed up as. That stranded employer signups
    // with seeker profiles (Valentina Cimolai @ bloompsychiatry.com hit
    // this twice in a row). The role intent is preserved in Supabase
    // user_metadata via the `data` field on auth.signUp(), so we read it
    // here. Anything other than 'employer' falls back to 'job_seeker' so
    // an attacker can't bootstrap an 'admin' profile via metadata.
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
        const metadataRole = (user.user_metadata as { role?: string } | null)?.role
        const signupRole: 'employer' | 'job_seeker' =
          metadataRole === 'employer' ? 'employer' : 'job_seeker'
        const metadataCompany = (user.user_metadata as { company?: string } | null)?.company ?? null
        const metadataFirstName = (user.user_metadata as { first_name?: string } | null)?.first_name ?? null
        const metadataLastName = (user.user_metadata as { last_name?: string } | null)?.last_name ?? null
        // No profile exists at all — create one
        profile = await prisma.userProfile.create({
          data: {
            supabaseId: user.id,
            email: user.email,
            role: signupRole,
            company: signupRole === 'employer' ? metadataCompany : null,
            firstName: metadataFirstName,
            lastName: metadataLastName,
          },
          include: profileInclude,
        })
        logger.info('Auto-created profile from auth metadata', {
          email: user.email,
          role: signupRole,
          fromMetadata: metadataRole === 'employer',
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
//
// SECURITY: This endpoint historically accepted `supabaseId` and `role`
// from the request body without auth. That allowed an unauthenticated
// caller to POST `{ supabaseId: "<victim>", role: "admin" }` and elevate
// to admin. The fix:
//   1. Require an authenticated Supabase session — `supabase.auth.getUser()`
//   2. Use `user.id` and `user.email` from the session, not the body
//   3. Allow-list `role` to `job_seeker` or `employer` — `admin` can only
//      be granted by direct DB action
const ALLOWED_SIGNUP_ROLES = new Set(['job_seeker', 'employer'])

export async function POST(request: NextRequest) {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'auth-profile', RATE_LIMITS.auth);
    if (rateLimitResult) return rateLimitResult;

  try {
    // Require an authenticated Supabase session before allowing profile
    // creation. The caller's identity comes from the session cookie, not
    // from the request body.
    const supabase = await createClient()
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!authUser.email) {
      return NextResponse.json({ error: 'Authenticated user has no email' }, { status: 400 })
    }

    const supabaseId = authUser.id
    const email = authUser.email

    const body = await request.json().catch(() => ({}))
    const {
      firstName: rawFirstName,
      lastName: rawLastName,
      role: rawRole,
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

    // Allow-list role. Anything else (including the literal 'admin')
    // collapses to the safe default.
    const role: 'job_seeker' | 'employer' =
      typeof rawRole === 'string' && ALLOWED_SIGNUP_ROLES.has(rawRole)
        ? (rawRole as 'job_seeker' | 'employer')
        : 'job_seeker'

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

    // On UPDATE we deliberately omit `role` so an existing profile (who may
    // have been promoted to admin manually) can never be demoted via a
    // re-call of the signup endpoint.
    const profile = await prisma.userProfile.upsert({
      where: { supabaseId },
      update: {
        firstName,
        lastName,
        company,
        phone,
      },
      create: {
        supabaseId,
        email,
        firstName,
        lastName,
        role,
        company,
        phone,
      }
    })

    // Create leads for new signups — job seekers go to email_leads, employers go to employer_leads
    // IMPORTANT: EmailLead must be created BEFORE JobAlert (foreign key: JobAlert.email → EmailLead.email)
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

          // Sync to Beehiiv newsletter (fire-and-forget)
          syncToBeehiiv(email, { utmSource: 'signup' })
        }
      } catch (leadError) {
        logger.error('Failed to create lead', leadError)
      }
    }

    // Create JobAlert if user opted in (only for new signups)
    // Must run AFTER EmailLead creation above (FK constraint)
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

    // Welcome email is sent after email confirmation, not during signup

    return NextResponse.json(profile)
  } catch (error) {
    logger.error('Profile POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Update profile fields
export async function PATCH(request: NextRequest) {
  // CSRF protection
  const csrfError = verifyCsrf(request);
  if (csrfError) return csrfError;

  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Sanitize basic fields.
    //
    // Each field distinguishes three states:
    //   - key absent from body          → `undefined`  (don't touch the column)
    //   - key present but empty/null    → `null`       (clear the column)
    //   - key present with a value      → sanitized string
    //
    // Earlier this function used a `body.X ? ... : undefined` pattern, which
    // collapsed "cleared by the user" (empty string, falsy) into the same
    // `undefined` as "field omitted" — so clearing a field in the settings
    // form never persisted, and the response refilled the user's edit with
    // the stale DB value.
    const firstName = body.firstName !== undefined ? (body.firstName ? sanitizeText(body.firstName, 50) : null) : undefined
    const lastName = body.lastName !== undefined ? (body.lastName ? sanitizeText(body.lastName, 50) : null) : undefined
    const phone = body.phone !== undefined ? (body.phone ? sanitizeText(body.phone, 20) : null) : undefined
    const company = body.company !== undefined ? (body.company ? sanitizeText(body.company, 100) : null) : undefined
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
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(phone !== undefined && { phone }),
        ...(company !== undefined && { company }),
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

    // Auto-refresh the candidate embedding when any embedder-driving field
    // changed in this PATCH. Mirrors lib/ai/vector-search.ts:buildCandidate
    // EmbeddingText (headline / yearsExperience / certifications /
    // licenseStates / specialties / bio — `skills` isn't editable here).
    // The Inngest function throttles per supabaseId for 30s, so a user
    // typing across several fields produces a single embedding refresh.
    // .catch() on the dispatch so a queue outage never breaks the user-
    // facing PATCH; the existing manual backfill stays as the safety net.
    const embedderFieldChanged =
      headline !== undefined ||
      bio !== undefined ||
      certifications !== undefined ||
      licenseStates !== undefined ||
      specialties !== undefined ||
      yearsExperience !== undefined
    if (embedderFieldChanged) {
      inngest.send({
        name: 'embedding.refresh.candidate',
        data: { supabaseId: user.id },
      }).catch((err) => {
        logger.warn('inngest.send embedding.refresh.candidate failed', undefined, err)
      })
    }

    return NextResponse.json(updatedProfile)
  } catch (error) {
    logger.error('Profile PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

