import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

// Type definitions
export type UserRole = 'job_seeker' | 'employer' | 'admin'

export interface AuthUser {
  id: string
  email: string
}

export interface UserProfile {
  id: string
  supabaseId: string
  email: string
  role: UserRole
  firstName: string | null
  lastName: string | null
  phone: string | null
  company: string | null
  resumeUrl: string | null
  avatarUrl: string | null
}

/**
 * Require authentication - redirects to /login if not authenticated
 */
export async function requireAuth(): Promise<{ user: AuthUser; profile: UserProfile | null }> {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  // Get or create profile
  let profile = await prisma.userProfile.findUnique({
    where: { supabaseId: user.id }
  })

  // Auto-create profile if doesn't exist
  if (!profile && user.email) {
    // Check by email first to avoid unique constraint errors
    profile = await prisma.userProfile.findFirst({
      where: { email: user.email }
    })

    if (profile && profile.supabaseId !== user.id) {
      // Update existing profile to point to current supabase user
      profile = await prisma.userProfile.update({
        where: { id: profile.id },
        data: { supabaseId: user.id }
      })
    } else if (!profile) {
      // Read the role + company that the signup form pushed into Supabase
      // user_metadata via auth.signUp's `data` field. Previously hardcoded
      // 'job_seeker' here, which stranded every employer signup whose
      // email-confirmation flow landed on a protected route before the
      // /api/auth/profile POST could write. /api/auth/profile GET has the
      // same logic — both auto-create paths must agree.
      const metadataRole = (user.user_metadata as { role?: string } | null)?.role
      const signupRole: 'employer' | 'job_seeker' =
        metadataRole === 'employer' ? 'employer' : 'job_seeker'
      const metadataCompany = (user.user_metadata as { company?: string } | null)?.company ?? null
      const metadataFirstName = (user.user_metadata as { first_name?: string } | null)?.first_name ?? null
      const metadataLastName = (user.user_metadata as { last_name?: string } | null)?.last_name ?? null
      profile = await prisma.userProfile.create({
        data: {
          supabaseId: user.id,
          email: user.email,
          role: signupRole,
          company: signupRole === 'employer' ? metadataCompany : null,
          firstName: metadataFirstName,
          lastName: metadataLastName,
        }
      })
    }
  }

  return {
    user: { id: user.id, email: user.email! },
    profile: profile as UserProfile | null
  }
}

/**
 * Require specific role(s) - redirects to /unauthorized if role doesn't match
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<{ user: AuthUser; profile: UserProfile }> {
  const { user, profile } = await requireAuth()

  if (!profile || !allowedRoles.includes(profile.role as UserRole)) {
    redirect('/unauthorized')
  }

  return { user, profile }
}

/**
 * Require admin role
 */
export async function requireAdmin() {
  return requireRole(['admin'])
}

/**
 * Require employer role (or admin)
 */
export async function requireEmployer() {
  return requireRole(['employer', 'admin'])
}

/**
 * Get current user without requiring auth (returns null if not logged in)
 */
export async function getCurrentUser(): Promise<{ user: AuthUser; profile: UserProfile | null } | null> {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  const profile = await prisma.userProfile.findUnique({
    where: { supabaseId: user.id }
  })

  return {
    user: { id: user.id, email: user.email! },
    profile: profile as UserProfile | null
  }
}

