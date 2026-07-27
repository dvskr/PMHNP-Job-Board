/**
 * GET /api/resume-studio/usage
 *
 * Current daily AI usage for the resume studio's three quota-capped tasks,
 * for the authenticated candidate. Pure read — drives the "2 of 3 left
 * today" badges in the studio UI.
 *
 * Returns: { usage: { resume_review, resume_tailoring, cover_letter } }
 * where each value is an AiUsageSnapshot ({ task, used, cap, remaining,
 * resetAtIso }).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { peekDailyQuota } from '@/lib/resume-studio/ai-quota';

export async function GET(request: NextRequest) {
  const rateLimitResult = await rateLimit(request, 'resume-studio:usage', { limit: 60, windowSeconds: 60 });
  if (rateLimitResult) return rateLimitResult;

  let userId: string;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const profile = await prisma.userProfile.findUnique({ where: { supabaseId: user.id } });
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    userId = user.id;
  } catch (err) {
    logger.warn('Resume studio usage auth failed', { error: err });
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
  }

  try {
    const [resumeReview, resumeTailoring, coverLetter] = await Promise.all([
      peekDailyQuota(userId, 'resume_review'),
      peekDailyQuota(userId, 'resume_tailoring'),
      peekDailyQuota(userId, 'cover_letter'),
    ]);

    return NextResponse.json({
      usage: {
        resume_review: resumeReview,
        resume_tailoring: resumeTailoring,
        cover_letter: coverLetter,
      },
    });
  } catch (err) {
    console.error('Resume studio usage lookup failed:', err);
    return NextResponse.json({ error: 'Failed to load usage.' }, { status: 500 });
  }
}
