import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/dashboard'
  const origin = requestUrl.origin

  if (code) {
    const supabase = await createClient()

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Check if profile exists, create if not
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
      }

      // If 'next' parameter is explicitly provided, use it
      // This is important for password reset flows and other auth redirects
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
        return NextResponse.redirect(`${origin}/dashboard`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}

