/**
 * GET /api/resume-studio/analyses
 *
 * The caller's 20 most recent ResumeAnalysis rows (all kinds: ats_score,
 * resume_review, resume_tailoring, cover_letter), newest first. Powers the
 * studio's analysis history panel. Owner-scoped by UserProfile.id — no
 * cross-user reads are possible.
 *
 * Returns: { analyses: [{ id, kind, documentId, jobId, createdAt, result }] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

const HISTORY_LIMIT = 20;

export async function GET(request: NextRequest) {
  const rateLimitResult = await rateLimit(request, 'resume-studio:analyses', { limit: 30, windowSeconds: 60 });
  if (rateLimitResult) return rateLimitResult;

  let profileId: string;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const profile = await prisma.userProfile.findUnique({ where: { supabaseId: user.id } });
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    profileId = profile.id;
  } catch (err) {
    logger.warn('Resume studio analyses auth failed', { error: err });
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
  }

  try {
    const analyses = await prisma.resumeAnalysis.findMany({
      where: { userId: profileId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        kind: true,
        documentId: true,
        jobId: true,
        createdAt: true,
        result: true,
      },
    });

    return NextResponse.json({ analyses });
  } catch (err) {
    console.error('Resume studio analyses lookup failed:', err);
    return NextResponse.json({ error: 'Failed to load analyses.' }, { status: 500 });
  }
}
