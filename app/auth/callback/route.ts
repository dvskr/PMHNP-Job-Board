import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncToBeehiiv } from '@/lib/beehiiv'
import { sendSignupWelcomeEmail } from '@/lib/email-service'
import { safeInternalPath } from '@/lib/auth/safe-redirect'

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

    // Check if profile exists, create if not
    try {
      const existingProfile = await prisma.userProfile.findUnique({
        where: { supabaseId: data.user.id }
      })

      if (!existingProfile && data.user.email) {
        const metadata = data.user.user_metadata || {}

        // Handle both email signup metadata and Google OAuth metadata
        let firstName = metadata.first_name || null
        let lastName = metadata.last_name || null
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
            role: metadata.role || 'job_seeker',
            company: metadata.company || null,
            avatarUrl: avatarUrl,
          }
        })

        // Sync new user to Beehiiv newsletter (fire-and-forget)
        syncToBeehiiv(data.user.email, { utmSource: 'google_signup' })

        // Create lead records (mirrors /api/auth/profile POST logic)
        try {
          const userRole = metadata.role || 'job_seeker'
          if (userRole === 'employer') {
            const existingEmployerLead = await prisma.employerLead.findFirst({
              where: { contactEmail: data.user.email },
            })
            if (!existingEmployerLead) {
              await prisma.employerLead.create({
                data: {
                  companyName: metadata.company || `${firstName || ''} ${lastName || ''}`.trim() || 'Unknown',
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
        if ((metadata.role || 'job_seeker') === 'job_seeker') {
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
          const userRole = metadata.role || 'job_seeker'
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
        const alreadySent = await prisma.emailSend.findFirst({
          where: { to: data.user.email, emailType: 'welcome_signup' },
        })
        if (!alreadySent) {
          const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: data.user.id },
            select: { firstName: true, role: true },
          })
          await sendSignupWelcomeEmail(
            data.user.email,
            profile?.firstName || data.user.user_metadata?.first_name || '',
            profile?.role || data.user.user_metadata?.role || 'job_seeker'
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
