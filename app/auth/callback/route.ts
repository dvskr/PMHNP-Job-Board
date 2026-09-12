import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncToBeehiiv } from '@/lib/beehiiv'
import { sendSignupWelcomeEmail } from '@/lib/email-service'
import { safeInternalPath } from '@/lib/auth/safe-redirect'
import { readSignupMetadata, restoreIfWithinGrace } from '@/lib/auth/ensure-profile'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  // Open-redirect guard: `${origin}${next}` with an unsanitized next allows
  // e.g. next='@evil.com' -> https://pmhnphiring.com@evil.com (external host).
  const next = safeInternalPath(requestUrl.searchParams.get('next'), '/dashboard')
  const origin = requestUrl.origin

  if (!code) {
    // No PKCE code → this isn't an OAuth handshake. It's almost certainly
    // a hash-fragment redirect (recovery / magic link) that was pointed at
    // /auth/callback by mistake — either an old email in someone's inbox
    // (sent before the redirect was switched to /auth/confirm) or some
    // other code path we missed.
    //
    // Hand off to /auth/confirm. The browser preserves the original URL
    // fragment across this redirect (since the new Location has none),
    // so #access_token=…&type=recovery will arrive at /auth/confirm
    // intact and the client there will parse it and route to
    // /reset-password. Genuine OAuth failures usually carry ?error=…
    // in the query string, which /auth/confirm also handles.
    const fallback = new URL('/auth/confirm', origin)
    requestUrl.searchParams.forEach((v, k) => fallback.searchParams.set(k, v))
    return NextResponse.redirect(fallback)
  }

  try {
    const supabase = await createClient()

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error || !data.user) {
      console.error('Auth callback: code exchange failed', error?.message)
      return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
    }

    // Password recovery: just exchange code and redirect, no profile setup
    const type = requestUrl.searchParams.get('type')
    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/reset-password`)
    }

    // Soft-delete gate, resolved before this handler acts on the session.
    // Google is a login path too, and the only restore that existed was a
    // fire-and-forget fetch on the password form: an OAuth user who had
    // deleted their account signed back in, got a full session, and was still
    // hard-deleted by the purge cron 30 days later. Restoring here fixes the
    // hole for previews of the same shape. An error resolving the state fails
    // closed: we do not hand out a session we could not check.
    let softDelete: 'active' | 'restored' | 'purge_pending' | 'unknown' = 'active'
    try {
      const current = await prisma.userProfile.findUnique({
        where: { supabaseId: data.user.id },
        select: { id: true, deletedAt: true, purgeAt: true },
      })
      if (current) softDelete = await restoreIfWithinGrace(prisma, current, 'auth/callback')
    } catch (gateErr) {
      console.error('Auth callback: soft-delete gate failed', gateErr)
      softDelete = 'unknown'
    }
    if (softDelete === 'purge_pending' || softDelete === 'unknown') {
      await supabase.auth.signOut()
      const reason = softDelete === 'purge_pending' ? 'account_unavailable' : 'auth_callback_failed'
      return NextResponse.redirect(`${origin}/login?error=${reason}`)
    }

    // Check if profile exists, create if not
    try {
      const existingProfile = await prisma.userProfile.findUnique({
        where: { supabaseId: data.user.id }
      })

      if (!existingProfile && data.user.email) {
        const metadata = data.user.user_metadata || {}

        // SECURITY: `user_metadata` is client-writable — a caller controls it
        // via supabase.auth.signUp({ options: { data } }) and updateUser({ data }).
        // Writing `role` straight from it let anyone mint an admin profile just
        // by signing up with { role: 'admin' } and completing the callback.
        // readSignupMetadata is the shared allow-list (employer | job_seeker,
        // never admin) that /api/auth/profile and requireAuth already use;
        // admin is granted by direct DB action only.
        const derived = readSignupMetadata(data.user)
        const signupRole = derived.role

        // Handle both email signup metadata and Google OAuth metadata
        let firstName = derived.firstName
        let lastName = derived.lastName
        const avatarUrl = metadata.avatar_url || null

        // For Google OAuth, parse full_name if firstName/lastName not provided
        if (!firstName && !lastName && metadata.full_name) {
          const nameParts = metadata.full_name.split(' ')
          firstName = nameParts[0] || null
          lastName = nameParts.slice(1).join(' ') || null
        }

        await prisma.userProfile.create({
          data: {
            supabaseId: data.user.id,
            email: data.user.email,
            firstName: firstName,
            lastName: lastName,
            role: signupRole,
            company: derived.company,
            avatarUrl: avatarUrl,
          }
        })

        // Sync new user to Beehiiv newsletter (fire-and-forget)
        syncToBeehiiv(data.user.email, { utmSource: 'google_signup' })

        // Create lead records (mirrors /api/auth/profile POST logic)
        try {
          const userRole = signupRole
          if (userRole === 'employer') {
            const existingEmployerLead = await prisma.employerLead.findFirst({
              where: { contactEmail: data.user.email },
            })
            if (!existingEmployerLead) {
              await prisma.employerLead.create({
                data: {
                  companyName: derived.company || `${firstName || ''} ${lastName || ''}`.trim() || 'Unknown',
                  contactEmail: data.user.email,
                  contactName: [firstName, lastName].filter(Boolean).join(' ') || null,
                  source: 'google_signup',
                  status: 'prospect',
                },
              })
            }
          } else {
            // Job seekers → email_leads with newsletter opt-in
            await prisma.emailLead.upsert({
              where: { email: data.user.email },
              update: {
                isSubscribed: true,
                newsletterOptIn: true,
              },
              create: {
                email: data.user.email,
                source: 'google_signup',
                isSubscribed: true,
                newsletterOptIn: true,
              },
            })
          }
        } catch (leadError) {
          console.error('Failed to create lead for Google user', leadError)
        }

        // Auto-create daily job alert for job seekers (only if none exists)
        if (signupRole === 'job_seeker') {
          try {
            const existingAlert = await prisma.jobAlert.findFirst({
              where: { email: data.user.email },
            })
            if (!existingAlert) {
              await prisma.jobAlert.create({
                data: {
                  email: data.user.email,
                  name: 'Job Highlights',
                  keyword: null,
                  location: null,
                  mode: null,
                  jobType: null,
                  minSalary: null,
                  maxSalary: null,
                  frequency: 'daily',
                  isActive: true,
                  token: crypto.randomUUID(),
                }
              })
            }
          } catch (e) {
            console.error('Failed to create auto job alert for Google user', e)
          }
        }

        // Send welcome email for first-time Google OAuth users only
        try {
          const userRole = signupRole
          await sendSignupWelcomeEmail(data.user.email, firstName || '', userRole)
        } catch (emailError) {
          console.error('Failed to send welcome email', emailError)
        }
      } // end of if (!existingProfile)
    } catch (profileError) {
      // Don't block login if profile creation fails
      console.error('Auth callback: profile creation error', profileError)
    }

    // Send welcome email (dedup: only if not already sent)
    if (data.user.email) {
      try {
        // A row exists for refused sends too, now that sendAndLog stamps
        // status='failed' instead of claiming success. Deduping on mere row
        // existence would let one Resend rejection cost the user their welcome
        // email permanently, so only a delivered send counts as already sent.
        const alreadySent = await prisma.emailSend.findFirst({
          where: { to: data.user.email, emailType: 'welcome_signup', status: { not: 'failed' } },
        })
        if (!alreadySent) {
          const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: data.user.id },
            select: { firstName: true, role: true },
          })
          await sendSignupWelcomeEmail(
            data.user.email,
            profile?.firstName || data.user.user_metadata?.first_name || '',
            profile?.role || 'job_seeker'
          )
          console.log('Welcome email sent', { userId: data.user.id })
        }
      } catch (welcomeErr) {
        console.error('Failed to send welcome email', welcomeErr)
      }
    }

    // Auto-link legacy jobs (e.g. guest posts) to this user
    if (data.user?.email) {
      try {
        await prisma.employerJob.updateMany({
          where: {
            contactEmail: data.user.email,
            userId: null,
          },
          data: {
            userId: data.user.id,
          },
        })
      } catch (e) {
        console.error('Failed to link legacy jobs', e)
      }
    }

    // If 'next' parameter is explicitly provided, use it
    if (requestUrl.searchParams.has('next')) {
      return NextResponse.redirect(`${origin}${next}`)
    }

    // Otherwise, redirect based on role
    const profile = await prisma.userProfile.findUnique({
      where: { supabaseId: data.user.id }
    })

    if (profile?.role === 'admin') {
      return NextResponse.redirect(`${origin}/admin/jobs`)
    } else if (profile?.role === 'employer') {
      return NextResponse.redirect(`${origin}/employer/dashboard`)
    } else {
      // Seekers land in the post-signup interstitial unless their profile is
      // already detailed enough to be embedded by the AI matcher. The page
      // itself enforces this — sending everyone there is intentional so we
      // also catch users who skipped onboarding on a previous session.
      return NextResponse.redirect(`${origin}/onboarding/professional`)
    }
  } catch (e) {
    console.error('Auth callback: unexpected error', e)
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
  }
}
