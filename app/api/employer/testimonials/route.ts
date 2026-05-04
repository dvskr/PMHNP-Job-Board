import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * POST /api/employer/testimonials
 *
 * Captures a "Share Your Story" submission from an employer. Replaces the
 * earlier hack that piggybacked on /api/feedback with a `[EMPLOYER-TESTIMONIAL]`
 * prefix in the message field — that approach lost structured consent data
 * and polluted feedback ratings.
 *
 * Body shape:
 *   {
 *     content: string,                 // required, max 2000 chars
 *     rating?: number,                 // optional 1-5
 *     consent: boolean,                // required — explicit opt-in for public feature
 *     displayAs?: 'full' | 'initial' | 'anonymous'  // default 'initial'
 *     employerJobId?: string           // optional — tie back to a specific posting
 *   }
 *
 * Auth: required. Tied to the submitter's Supabase user id and their most
 * recent employer profile so admins can review who said what before featuring.
 */
export async function POST(request: NextRequest) {
  const rateLimitResult = await rateLimit(request, 'testimonial', RATE_LIMITS.feedback);
  if (rateLimitResult) return rateLimitResult;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const {
      content,
      rating,
      consent,
      displayAs,
      employerJobId,
    } = body as {
      content?: unknown;
      rating?: unknown;
      consent?: unknown;
      displayAs?: unknown;
      employerJobId?: unknown;
    };

    // Validation — small minimum so quick blurbs work, hard cap at 2000.
    const trimmed = typeof content === 'string' ? content.trim() : '';
    if (trimmed.length < 10) {
      return NextResponse.json(
        { error: 'Please share a bit more — at least 10 characters.' },
        { status: 400 }
      );
    }
    if (trimmed.length > 2000) {
      return NextResponse.json(
        { error: 'Testimonial too long — please keep it under 2000 characters.' },
        { status: 400 }
      );
    }

    // Consent is mandatory — without it we can't store or feature the
    // testimonial, so refuse the submission rather than recording an
    // unusable row.
    if (consent !== true) {
      return NextResponse.json(
        { error: 'Please check the consent box so we can feature your testimonial.' },
        { status: 400 }
      );
    }

    let normalizedRating: number | null = null;
    if (rating !== undefined && rating !== null) {
      if (typeof rating !== 'number' || rating < 1 || rating > 5) {
        return NextResponse.json(
          { error: 'Rating must be a number between 1 and 5.' },
          { status: 400 }
        );
      }
      normalizedRating = Math.round(rating);
    }

    const validDisplayAs = ['full', 'initial', 'anonymous'] as const;
    const normalizedDisplayAs = typeof displayAs === 'string' && (validDisplayAs as readonly string[]).includes(displayAs)
      ? displayAs
      : 'initial';

    // Resolve employer name from the most recent EmployerJob — falls back to
    // user metadata if they haven't posted yet (rare, but possible if they
    // signed up and went straight to a feedback prompt).
    const recentJob = await prisma.employerJob.findFirst({
      where: {
        OR: [
          { userId: user.id },
          { contactEmail: user.email || '' },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { employerName: true },
    });

    const employerName = recentJob?.employerName
      || (user.user_metadata?.company as string | undefined)
      || (user.user_metadata?.full_name as string | undefined)
      || user.email
      || 'Anonymous employer';

    // If employerJobId was passed, verify ownership before storing it.
    let verifiedJobId: string | null = null;
    if (typeof employerJobId === 'string' && employerJobId.length > 0) {
      const owned = await prisma.employerJob.findFirst({
        where: {
          id: employerJobId,
          OR: [
            { userId: user.id },
            { contactEmail: user.email || '' },
          ],
        },
        select: { id: true },
      });
      if (owned) verifiedJobId = owned.id;
    }

    await prisma.employerTestimonial.create({
      data: {
        userId: user.id,
        employerJobId: verifiedJobId,
        employerName,
        content: trimmed,
        rating: normalizedRating,
        consent: consent === true,
        displayAs: normalizedDisplayAs,
      },
    });

    logger.info('Employer testimonial recorded', {
      userId: user.id,
      consent: consent === true,
      displayAs: normalizedDisplayAs,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error saving employer testimonial', error);
    return NextResponse.json(
      { error: 'Failed to save testimonial. Please try again.' },
      { status: 500 }
    );
  }
}
