/**
 * Single source of truth for "auto-create a UserProfile from a Supabase
 * auth user". Both `lib/auth/protect.ts:requireAuth` and the
 * `/api/auth/profile` GET handler call into here so the role-detection
 * logic can never drift between them again.
 *
 * Why this exists:
 * Prior to 2026-05-26 two separate auto-create paths each hardcoded
 * `role: 'job_seeker'`. SignUpForm pushed the actual signup intent into
 * Supabase `user_metadata.role`, but neither auto-create path read it
 * back. Result: every employer signup that hit a protected route before
 * the SignUpForm's POST could land (the common case when email
 * confirmation is required) was stranded as a job_seeker profile —
 * silently, with no error logs. We had a steady trickle of "I tried
 * to sign up as employer but got a job_seeker profile" contact-form
 * complaints before tracing the cause.
 *
 * Rules this helper enforces:
 *   - Allow-list role to ('employer' | 'job_seeker'). Anything else
 *     (including the literal 'admin') falls back to 'job_seeker' —
 *     admin can only be granted by direct DB action.
 *   - Pull first_name / last_name / company from metadata so the row
 *     is fully populated, not just role.
 *   - One structured log per auto-create so we can grep for unexpected
 *     fallbacks in prod.
 */
import type { User } from '@supabase/supabase-js'
import type { PrismaClient } from '@prisma/client'
import { logger } from '@/lib/logger'

interface SupabaseAuthMetadata {
  role?: string
  company?: string
  first_name?: string
  last_name?: string
}

export interface AuthMetadataDerivedFields {
  role: 'employer' | 'job_seeker'
  company: string | null
  firstName: string | null
  lastName: string | null
}

/**
 * Pure helper: extract the profile fields the signup flow stashed in
 * `auth.user_metadata` via `supabase.auth.signUp({ ..., options: { data } })`.
 * Returns safe defaults for anything missing. Exported so callers that
 * need the derived role *without* writing to the DB (e.g. analytics)
 * can reuse the same allow-list logic.
 */
export function readSignupMetadata(user: User): AuthMetadataDerivedFields {
  const meta = (user.user_metadata ?? {}) as SupabaseAuthMetadata
  const role: 'employer' | 'job_seeker' =
    meta.role === 'employer' ? 'employer' : 'job_seeker'
  return {
    role,
    company: role === 'employer' && meta.company ? meta.company : null,
    firstName: meta.first_name ?? null,
    lastName: meta.last_name ?? null,
  }
}

/**
 * Idempotent profile bootstrap. Returns the existing profile if one is
 * already linked to the auth user, otherwise creates one with the
 * metadata-derived role + name fields. If a stale profile exists with
 * the same email but a different supabaseId (re-signup after delete),
 * it gets relinked rather than duplicated.
 *
 * NOTE: This function ONLY creates. It never updates an existing
 * profile's role — that's intentional. An admin who was promoted via
 * direct DB action must not be demotable just by hitting a protected
 * route. If you need to update a freshly-created row's role later
 * (e.g. user upgraded plan), do it explicitly in the route handler.
 */
export async function ensureProfileFromAuth<
  T extends { id: string; supabaseId: string; email: string; role: string }
>(
  prisma: PrismaClient,
  user: User,
  options: {
    /** Prisma include for callers that need _count or other relations. */
    include?: Record<string, unknown>
    /** Extra log context (caller name, etc.). */
    logSource?: string
  } = {},
): Promise<T | null> {
  if (!user.email) return null

  // Fast path: profile already exists on this supabaseId.
  const existing = await prisma.userProfile.findUnique({
    where: { supabaseId: user.id },
    ...(options.include ? { include: options.include } : {}),
  })
  if (existing) return existing as unknown as T

  // Slow path 1: profile exists under this email but a different
  // supabaseId. Happens when the auth user was deleted+recreated. Relink.
  const byEmail = await prisma.userProfile.findFirst({
    where: { email: user.email },
    ...(options.include ? { include: options.include } : {}),
  })
  if (byEmail && byEmail.supabaseId !== user.id) {
    const relinked = await prisma.userProfile.update({
      where: { id: byEmail.id },
      data: { supabaseId: user.id },
      ...(options.include ? { include: options.include } : {}),
    })
    logger.info('[ensureProfileFromAuth] relinked existing profile to new auth user', {
      email: user.email,
      profileId: byEmail.id,
      source: options.logSource ?? null,
    })
    return relinked as unknown as T
  }
  if (byEmail) return byEmail as unknown as T

  // Slow path 2: no profile anywhere. Create from auth metadata.
  const derived = readSignupMetadata(user)
  const created = await prisma.userProfile.create({
    data: {
      supabaseId: user.id,
      email: user.email,
      role: derived.role,
      company: derived.company,
      firstName: derived.firstName,
      lastName: derived.lastName,
    },
    ...(options.include ? { include: options.include } : {}),
  })
  logger.info('[ensureProfileFromAuth] created profile from auth metadata', {
    email: user.email,
    role: derived.role,
    hasEmployerMetadata: derived.role === 'employer',
    source: options.logSource ?? null,
  })
  return created as unknown as T
}
