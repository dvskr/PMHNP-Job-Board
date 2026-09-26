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
import { ensureProfileFromAuth } from '@/lib/auth/ensure-profile'

// The settings editor counts a professional summary up to this same limit
// (app/settings/page.tsx). When the server cap was lower, sanitizeText()
// sliced the tail off without complaint and the PATCH still answered 200, so
// the user got a "Profile updated!" toast over a summary that had quietly
// lost its last paragraphs. Keep the two numbers equal.
const BIO_MAX_LENGTH = 1000

// Mirrors the maxLength the settings form puts on both name inputs, for the
// same reason as the summary above: a server cap below the one the UI advertises
// truncates silently behind a success toast.
const NAME_MAX_LENGTH = 50

// The rate type decides whether the desired-salary numbers mean an hourly or
// an annual range. Every reader falls back to 'yearly', so an unrecognised
// value would silently misprice a candidate to employers.
const SALARY_RATE_TYPES = new Set(['hourly', 'yearly'])

// `parseInt(x, 10) || null` mapped a legitimate 0 to null: "New Grad (0)"
// disappeared on every save (the select came back empty under a success
// toast), new grads dropped out of `yearsExperience >= N` employer filters,
// and a $0 floor could not be expressed. Only genuinely unparseable input
// is null.
function toIntOrNull(value: unknown): number | null {
  const parsed = Number.parseInt(String(value), 10)
  return Number.isNaN(parsed) ? null : parsed
}

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

    // Same auto-create logic as lib/auth/protect.ts:requireAuth.
    // Centralised in lib/auth/ensure-profile.ts so the two paths can't
    // drift again — see that file's header for the full bug history.
    const profile = await ensureProfileFromAuth(prisma, user, {
      include: profileInclude,
      logSource: 'GET /api/auth/profile',
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

    const firstName = rawFirstName ? sanitizeText(rawFirstName, NAME_MAX_LENGTH) : null
    const lastName = rawLastName ? sanitizeText(rawLastName, NAME_MAX_LENGTH) : null
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

    // On UPDATE, `role` is normally omitted so an existing profile (who may
    // have been promoted to admin manually) can never be demoted via a
    // re-call of the signup endpoint. ONE transition is allowed through:
    // job_seeker -> employer. Without it, an employer whose first sign-in
    // (typically Google OAuth) defaulted them to job_seeker completed the
    // employer signup form, got a success response, and NOTHING changed —
    // their "employer profile" never existed and every employer surface
    // refused them (seen in prod, reported by the employer as an "account
    // conflict"). The free-email-domain check above already ran for
    // role === 'employer', so a consumer-address upgrade is still refused.
    // admin is untouchable in both directions; employer -> job_seeker stays
    // support-only so quota identity never silently changes hands.
    const allowRoleUpgrade = existingProfile?.role === 'job_seeker' && role === 'employer'
    const profile = await prisma.userProfile.upsert({
      where: { supabaseId },
      update: {
        firstName,
        lastName,
        // Company name is captured once and never rewritten by a re-call of
        // the signup endpoint. It is only filled here when the account has
        // none yet (the job_seeker -> employer upgrade above is the real
        // case). Rewriting it would hand an existing employer a rename that
        // PATCH /api/employer/settings and PATCH below both refuse, and a
        // rename resets the org quota identity (lib/employer-quota.ts).
        ...(existingProfile?.company ? {} : { company }),
        phone,
        ...(allowRoleUpgrade ? { role: 'employer' } : {}),
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
    // A job_seeker upgrading to employer counts as a new employer signup for
    // lead purposes (the employerLead lookup below dedupes by email anyway).
    if (!existingProfile || allowRoleUpgrade) {
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
    //
    // A fourth state hid inside the third: sanitizeText() trims and strips
    // scripts, so "     " and "<script>…</script>" both reach the column as an
    // empty string. A whitespace-only first name therefore wiped the
    // candidate's display name under a "Profile updated!" toast. Input that
    // survives sanitizing as nothing is refused instead — clearing a field is
    // still possible, it just has to be explicit (send '' or null).
    const blankedFields: string[] = []
    const text = (key: string, maxLength: number): string | null | undefined => {
      const raw = body[key]
      if (raw === undefined) return undefined
      if (!raw) return null
      const cleaned = sanitizeText(raw, maxLength)
      if (!cleaned) {
        blankedFields.push(key)
        return undefined
      }
      return cleaned
    }

    const firstName = text('firstName', NAME_MAX_LENGTH)
    const lastName = text('lastName', NAME_MAX_LENGTH)
    const phone = text('phone', 20)
    const company = text('company', 100)
    const avatarUrl = body.avatarUrl !== undefined ? (body.avatarUrl ? sanitizeUrl(body.avatarUrl) : null) : undefined
    // SECURITY / DATA LOSS: `resumeUrl` is deliberately NOT accepted here.
    //
    // It named a private storage object that /api/documents/resume/me/url and
    // the autofill routes sign with the service-role key, with no ownership
    // check of their own. Accepting it from the body let any signed-in user
    // point their own profile at someone else's resume path and then read that
    // resume through their own endpoints.
    //
    // The same line also destroyed data: the stored value is a bare storage
    // path, sanitizeUrl() returns '' for anything that is not http(s)/mailto or
    // root-relative, so a settings form that echoed the profile back wiped the
    // candidate's resume link.
    //
    // The field is written server-side only: POST /api/upload on a successful
    // upload, and DELETE /api/profile/resume to clear it.

    // Sanitize new PMHNP fields
    const headline = text('headline', 120)
    const bio = text('bio', BIO_MAX_LENGTH)
    const certifications = text('certifications', 500)
    const licenseStates = text('licenseStates', 500)
    const specialties = text('specialties', 500)
    const preferredWorkMode = text('preferredWorkMode', 30)
    const preferredJobType = text('preferredJobType', 30)
    const linkedinUrl = body.linkedinUrl !== undefined ? (body.linkedinUrl ? sanitizeUrl(body.linkedinUrl) : null) : undefined

    // Integer fields. 0 is a real answer here ("New Grad"), so parsing goes
    // through toIntOrNull rather than a `|| null` falsy collapse.
    const yearsExperience = body.yearsExperience !== undefined
      ? (body.yearsExperience !== null ? toIntOrNull(body.yearsExperience) : null)
      : undefined
    const desiredSalaryMin = body.desiredSalaryMin !== undefined
      ? (body.desiredSalaryMin !== null ? toIntOrNull(body.desiredSalaryMin) : null)
      : undefined
    const desiredSalaryMax = body.desiredSalaryMax !== undefined
      ? (body.desiredSalaryMax !== null ? toIntOrNull(body.desiredSalaryMax) : null)
      : undefined

    const rawSalaryType = text('desiredSalaryType', 20)
    const desiredSalaryType = typeof rawSalaryType === 'string' ? rawSalaryType.toLowerCase() : rawSalaryType

    // Nothing has been written yet, so one 400 can name every field that would
    // have landed blank. The label is derived rather than mapped so a new field
    // cannot be added without one.
    if (blankedFields.length > 0) {
      const labels = blankedFields.map((key) => {
        const spaced = key.replace(/([A-Z])/g, ' $1').toLowerCase()
        return spaced.charAt(0).toUpperCase() + spaced.slice(1)
      })
      return NextResponse.json(
        {
          error: `${labels.join(', ')} cannot be saved as blank. Enter a value, or clear the field to remove it.`,
          code: 'FIELD_BLANK_AFTER_SANITIZE',
          fields: blankedFields,
        },
        { status: 400 },
      )
    }

    // Reject an unknown rate type instead of storing it: readers fall back to
    // 'yearly', so a typo would present an hourly range as an annual salary.
    if (typeof desiredSalaryType === 'string' && !SALARY_RATE_TYPES.has(desiredSalaryType)) {
      return NextResponse.json(
        { error: "desiredSalaryType must be 'hourly' or 'yearly'" },
        { status: 400 },
      )
    }

    // Boolean fields
    const openToOffers = typeof body.openToOffers === 'boolean' ? body.openToOffers : undefined
    const profileVisible = typeof body.profileVisible === 'boolean' ? body.profileVisible : undefined

    // DateTime field. An unparseable string produced an Invalid Date that
    // only failed inside Prisma, surfacing as a public 500 with no hint of
    // which field was wrong.
    const availableDate = body.availableDate !== undefined
      ? (body.availableDate ? new Date(body.availableDate) : null)
      : undefined
    if (availableDate instanceof Date && Number.isNaN(availableDate.getTime())) {
      return NextResponse.json({ error: 'availableDate is not a valid date' }, { status: 400 })
    }

    // COMPANY NAME IS WRITE-ONCE, the same contract PATCH
    // /api/employer/settings enforces (that route carries the full rationale).
    // The name anchors organization identity for every posting the account
    // publishes, and it feeds the acct:/dom:/org: quota keys in
    // lib/employer-quota.ts that now gate the discounted first post: a rename
    // between posts republishes under a fresh-looking brand and re-earns the
    // discount. The lock previously lived only in the employer settings route
    // while /settings PATCHes the whole profile here, so the strict endpoint
    // sat behind a wide-open one. A same-value write must still pass, or
    // saving an unrelated field would 409.
    const existing = await prisma.userProfile.findUnique({
      where: { supabaseId: user.id },
      select: { company: true, desiredSalaryMin: true, desiredSalaryMax: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }
    const lockedCompany = existing.company?.trim() || ''
    if (lockedCompany && company !== undefined && (company?.trim() || '') !== lockedCompany) {
      return NextResponse.json(
        {
          error: 'Company name is set at signup and cannot be changed here. Contact support and we will update it for you.',
          code: 'COMPANY_NAME_LOCKED',
          currentName: existing.company,
        },
        { status: 409 },
      )
    }

    // An inverted range is a typo, not a preference: it advertises an
    // impossible expectation to employers and makes every `min <= X <= max`
    // reader (matching, the salary filters) return nothing for the candidate.
    // Compared against the stored values too, because a PATCH that raises only
    // the minimum past an untouched maximum inverts the range just as surely as
    // one that sends both.
    //
    // Only when the request actually touches a salary field. This endpoint
    // takes partial patches from screens that have no salary inputs at all:
    // the avatar upload in /settings sends { avatarUrl } alone, and
    // onboarding sends headline and specialties. Validating the merged range
    // on those turned an account that already held an inverted range into one
    // that could not change its avatar or finish onboarding, and the error it
    // got named fields the screen does not show.
    const touchesSalary = desiredSalaryMin !== undefined || desiredSalaryMax !== undefined
    const effectiveSalaryMin = desiredSalaryMin !== undefined ? desiredSalaryMin : (existing.desiredSalaryMin ?? null)
    const effectiveSalaryMax = desiredSalaryMax !== undefined ? desiredSalaryMax : (existing.desiredSalaryMax ?? null)
    if (
      touchesSalary &&
      effectiveSalaryMin !== null &&
      effectiveSalaryMax !== null &&
      effectiveSalaryMin > effectiveSalaryMax
    ) {
      return NextResponse.json(
        {
          error: 'Desired salary minimum cannot be higher than the maximum.',
          code: 'SALARY_RANGE_INVERTED',
        },
        { status: 400 },
      )
    }

    const updatedProfile = await prisma.userProfile.update({
      where: { supabaseId: user.id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(phone !== undefined && { phone }),
        ...(company !== undefined && { company }),
        ...(avatarUrl !== undefined && { avatarUrl }),
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

