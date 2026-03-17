import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/auth/me
 * Returns the current user's basic profile for analytics user identity.
 * Lightweight — no sensitive data exposed.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ id: null }, { status: 200 });
    }

    // Fetch basic profile data for analytics user properties
    const profile = await prisma.userProfile.findUnique({
      where: { supabaseId: user.id },
      select: {
        role: true,
        resumeUrl: true,
        profileVisible: true,
      },
    });

    return NextResponse.json({
      id: user.id,
      role: profile?.role || 'job_seeker',
      resumeUrl: profile?.resumeUrl || null,
      profileVisible: profile?.profileVisible ?? false,
    });
  } catch {
    return NextResponse.json({ id: null }, { status: 200 });
  }
}
