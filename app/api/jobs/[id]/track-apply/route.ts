import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { CONSENT_COOKIE, parseConsentCookie } from '@/lib/consent';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'track-apply', RATE_LIMITS.telemetry);
    if (rateLimitResult) return rateLimitResult;

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Job ID is required' },
        { status: 400 }
      );
    }

    // Always bump the aggregate counter — this is essential analytics
    // for job ranking and is not personally identifiable.
    await prisma.job.update({
      where: { id },
      data: {
        applyClickCount: {
          increment: 1,
        },
      },
    });

    // The detailed per-click record (sessionId, referrer, userAgent)
    // counts as analytics under CPRA "sharing" — only persist it when
    // the user has granted analytics consent. Without consent we keep
    // the aggregate count above, which has no PII signal.
    const consent = parseConsentCookie((await cookies()).get(CONSENT_COOKIE)?.value);
    if (consent?.analytics === true) {
      const job = await prisma.job.findUnique({
        where: { id },
        select: { sourceProvider: true },
      });

      await prisma.applyClick.create({
        data: {
          jobId: id,
          source: job?.sourceProvider || 'unknown',
          sessionId: request.headers.get('x-session-id') || null,
          referrer: request.headers.get('referer') || null,
          userAgent: request.headers.get('user-agent') || null,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    // H4 fix: previously this returned `{ success: true }` on every failure,
    // including Prisma "record not found" — which permanently dropped the
    // apply-click analytic with a false-positive signal to the caller.
    //
    // New contract: report failure honestly with a 200-status JSON body
    // (so the apply flow on the client doesn't break or surface a scary
    // alert), but the response shape lets the client and observability
    // distinguish a tracked apply from a swallowed one. The redirect to
    // the employer's apply link is the user-visible action and never
    // depended on this response.
    const errCode = (error as { code?: string } | null)?.code ?? null;
    const reason = errCode === 'P2025' ? 'job_not_found' : 'persist_failed';
    logger.error('Error tracking apply click', error, { jobId: (await params).id, reason });
    return NextResponse.json({ success: false, reason }, { status: 200 });
  }
}

