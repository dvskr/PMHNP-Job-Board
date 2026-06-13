import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * POST /api/feedback
 *
 * Candidate-facing feedback sink for the dashboard rating + testimonial cards
 * (components/dashboard/DashboardContent.tsx). Persists to the UserFeedback
 * model. The route was previously missing, so every submission 404'd while the
 * UI still flashed a success state — feedback was silently lost.
 *
 * Body: { rating: number (1-5), message?: string, page?: string }
 * Auth: optional. UserFeedback.userId is nullable; when a session exists we
 * attribute the row, otherwise it's stored anonymously.
 */
export async function POST(request: NextRequest) {
  const rateLimitResult = await rateLimit(request, 'feedback', RATE_LIMITS.feedback);
  if (rateLimitResult) return rateLimitResult;

  try {
    const body = await request.json();
    const { rating, message, page } = body as {
      rating?: unknown;
      message?: unknown;
      page?: unknown;
    };

    if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'Rating must be a number between 1 and 5.' },
        { status: 400 }
      );
    }

    const normalizedMessage =
      typeof message === 'string' && message.trim().length > 0
        ? message.trim().slice(0, 2000)
        : null;
    const normalizedPage =
      typeof page === 'string' && page.trim().length > 0 ? page.trim().slice(0, 120) : null;

    // Attribute to the signed-in user when available (dashboard is authed),
    // but don't require it — the model allows anonymous rows.
    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }

    await prisma.userFeedback.create({
      data: {
        userId,
        rating: Math.round(rating),
        message: normalizedMessage,
        page: normalizedPage,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error saving feedback', error);
    return NextResponse.json(
      { error: 'Failed to save feedback. Please try again.' },
      { status: 500 }
    );
  }
}
