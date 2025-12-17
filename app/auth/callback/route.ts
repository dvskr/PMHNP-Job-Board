import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
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
        
        await prisma.userProfile.create({
          data: {
            supabaseId: data.user.id,
            email: data.user.email,
            firstName: metadata.first_name || null,
            lastName: metadata.last_name || null,
            role: metadata.role || 'job_seeker',
            company: metadata.company || null,
          }
        })
      }

      // Redirect based on role
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

