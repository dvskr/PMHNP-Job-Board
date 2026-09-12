import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { ensureProfileFromAuth } from '@/lib/auth/ensure-profile'

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
export async function requireAuth(): Promise<{ user: AuthUser; profile: UserProfile }> {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  // Single source of truth for auto-create. See lib/auth/ensure-profile.ts —
  // this is the path that runs first for SSR-protected pages, so the role
  // selection it makes determines whether new employer signups land in
  // /employer/dashboard or get stranded in /onboarding/professional. It is
  // also where a soft-deleted account is restored on re-login.
  const profile = await ensureProfileFromAuth<UserProfile>(prisma, user, {
    logSource: 'requireAuth',
  })

  if (!profile) {
    // Null means the session cannot be turned into a usable profile: no email
    // on the auth user, or an account whose 30-day restore window lapsed and
    // is queued for hard deletion. Letting either through handed a protected
    // page a half-populated session, so bounce instead of rendering.
    redirect('/login?error=account_unavailable')
  }

  return {
    user: { id: user.id, email: user.email! },
    profile,
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

  // A soft-deleted account reads as signed out here. Two reasons, both load-
  // bearing: public surfaces must not treat an account we have been asked to
  // erase as a live identity, and /login redirects anyone getCurrentUser
  // recognises straight back to the dashboard — which, for an account
  // requireAuth refuses, is a redirect loop. Restoring is deliberately NOT
  // done here: this runs on public pages and must stay read-only. The restore
  // happens when the user reaches an authenticated path
  // (lib/auth/ensure-profile.ts) or re-logs in.
  if (profile?.deletedAt) {
    return null
  }

  return {
    user: { id: user.id, email: user.email! },
    profile: profile as UserProfile | null
  }
}

