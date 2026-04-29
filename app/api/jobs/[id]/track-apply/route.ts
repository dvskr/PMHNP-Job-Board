import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

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

    // Increment applyClickCount
    await prisma.job.update({
      where: { id },
      data: {
        applyClickCount: {
          increment: 1,
        },
      },
    });

    // Get job to know its source
    const job = await prisma.job.findUnique({
      where: { id },
      select: { sourceProvider: true },
    });

    // Create detailed click record
    await prisma.applyClick.create({
      data: {
        jobId: id,
        source: job?.sourceProvider || 'unknown',
        sessionId: request.headers.get('x-session-id') || null,
        referrer: request.headers.get('referer') || null,
        userAgent: request.headers.get('user-agent') || null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    // If job not found, still return success (don't break the apply flow)
    logger.error('Error tracking apply click:', error);
    return NextResponse.json({ success: true });
  }
}

