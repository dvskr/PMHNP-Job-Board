import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/auth/me
 * Returns the current user's basic profile for analytics user identity.
 * Lightweight — no sensitive data exposed.
 *
 * Side-effect: bumps user_profiles.last_seen_at to feed the inactive-
 * user purge cron (Sprint 3). Throttled to once every 15 minutes per
 * user so we don't write on every page navigation.
 */
const LAST_SEEN_THROTTLE_MS = 15 * 60 * 1000;

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ id: null }, { status: 200 });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { supabaseId: user.id },
      select: {
        id: true,
        role: true,
        resumeUrl: true,
        profileVisible: true,
        lastSeenAt: true,
      },
    });

    // Bump last_seen_at if stale. Fire-and-forget so the user-facing
    // response isn't slowed down by the write.
    if (profile && (!profile.lastSeenAt || Date.now() - profile.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS)) {
      void prisma.userProfile
        .update({
          where: { id: profile.id },
          data: { lastSeenAt: new Date() },
        })
        .catch(() => { /* noop — never break /me on a tracking write */ });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email || null,
      role: profile?.role || 'job_seeker',
      resumeUrl: profile?.resumeUrl || null,
      profileVisible: profile?.profileVisible ?? false,
    });
  } catch {
    return NextResponse.json({ id: null }, { status: 200 });
  }
}
