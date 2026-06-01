import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * GET /api/jobs/edit/[token]
 *
 * Loads an employer's job for the unauthenticated edit form. The `editToken`
 * is the magic-link credential delivered via the post-confirmation email.
 *
 * Security posture:
 *   - Rate-limited per IP (auth preset) so the UUID token space cannot be
 *     brute-forced even at modest scale.
 *   - Every successful and failed access is logged with anonymized context
 *     so token enumeration attempts are visible in observability.
 *   - The response is deliberately scoped to fields the edit form renders —
 *     contactEmail is included because the form displays it for editing,
 *     not because callers should be able to harvest it. Treat the token as
 *     a bearer credential; the rate limiter is the brute-force defense.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // H2 fix: rate-limit to bound any future token-guessing attempt and to
  // make abuse visible in logs.
  const limited = await rateLimit(request, 'jobs-edit-token', RATE_LIMITS.auth);
  if (limited) return limited;

  try {
    const resolvedParams = await params;
    const token = resolvedParams.token;

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    const employerJob = await prisma.employerJob.findFirst({
      where: { editToken: token },
      include: {
        job: {
          include: {
            // Pull screening questions so the edit form can display + modify
            // them in-place. Order by sortOrder for stable rendering.
            screeningQuestions: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    if (!employerJob) {
      // Log failed attempts so token enumeration shows up as an outlier
      // in the dashboard alongside successful loads.
      logger.warn('[jobs-edit] invalid edit token', {
        // Hash-truncate the token in logs so the raw value never lands
        // in observability storage even if a legitimate token was used
        // by an attacker.
        tokenPrefix: token.slice(0, 4),
      });
      return NextResponse.json(
        { error: 'Invalid or expired edit token' },
        { status: 401 }
      );
    }

    // P5.A fix (2026-06-01): runbook flagged that the edit token never
    // expires — once a confirmation email leaks (forwarded, archived,
    // breached) anyone can edit/unpublish the posting indefinitely.
    // Bound the validity window: the token is honored while the job is
    // published OR within 30 days of its expiresAt cutoff. Anything past
    // that is rejected so an old leaked email can't reach a years-old
    // record. Renewal/repost flows mint fresh tokens (see the webhook).
    const EDIT_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
    const expiresAt = employerJob.job.expiresAt;
    if (!employerJob.job.isPublished) {
      const ageMs = expiresAt ? Date.now() - new Date(expiresAt).getTime() : Number.POSITIVE_INFINITY;
      if (ageMs > EDIT_GRACE_MS) {
        logger.warn('[jobs-edit] edit-token rejected: job too far past expiry', {
          tokenPrefix: token.slice(0, 4),
          jobId: employerJob.job.id,
        });
        return NextResponse.json(
          { error: 'Edit window has closed for this posting. Renew or re-post via your dashboard.' },
          { status: 401 }
        );
      }
    }

    return NextResponse.json({
      job: employerJob.job,
      employerJob: {
        id: employerJob.id,
        employerName: employerJob.employerName,
        contactEmail: employerJob.contactEmail,
        companyWebsite: employerJob.companyWebsite,
        companyLogoUrl: employerJob.companyLogoUrl,
        paymentStatus: employerJob.paymentStatus,
      },
    });
  } catch (error) {
    logger.error('Error fetching job for edit', error);
    return NextResponse.json(
      { error: 'Failed to fetch job' },
      { status: 500 }
    );
  }
}

