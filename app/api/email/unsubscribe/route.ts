import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { readJsonBody } from '@/app/api/_lib/json-body';

// GET - Unsubscribe
export async function GET(request: NextRequest) {
  // The POST sibling has always been rate limited and this one was not, even
  // though it performs the destructive half of the pair. Tokens are cuids so
  // guessing is not the real threat; an unthrottled write endpoint reachable
  // by GET is.
  const rateLimitResult = await rateLimit(request, 'email-unsub', RATE_LIMITS.general);
  if (rateLimitResult) return rateLimitResult;

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Token is required' },
        { status: 400 }
      );
    }

    // Find EmailLead by unsubscribeToken
    const emailLead = await prisma.emailLead.findUnique({
      where: { unsubscribeToken: token },
    });

    if (!emailLead) {
      return NextResponse.json(
        { success: false, message: 'Invalid token' },
        { status: 404 }
      );
    }

    // Update isSubscribed and newsletterOptIn to false
    await prisma.emailLead.update({
      where: { unsubscribeToken: token },
      data: { isSubscribed: false, newsletterOptIn: false },
    });

    return NextResponse.json({
      success: true,
      message: 'Unsubscribed successfully',
    });
  } catch (error) {
    logger.error('Error unsubscribing:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to unsubscribe' },
      { status: 500 }
    );
  }
}

// POST - Resubscribe
export async function POST(request: NextRequest) {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'email-unsub', RATE_LIMITS.general);
    if (rateLimitResult) return rateLimitResult;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  try {
    const { token } = parsed.body as { token?: string };

    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Token is required' },
        { status: 400 }
      );
    }

    // Find EmailLead by unsubscribeToken
    const emailLead = await prisma.emailLead.findUnique({
      where: { unsubscribeToken: token },
    });

    if (!emailLead) {
      return NextResponse.json(
        { success: false, message: 'Invalid token' },
        { status: 404 }
      );
    }

    // Update isSubscribed to true
    await prisma.emailLead.update({
      where: { unsubscribeToken: token },
      data: { isSubscribed: true },
    });

    return NextResponse.json({
      success: true,
      message: 'Resubscribed successfully',
    });
  } catch (error) {
    logger.error('Error resubscribing:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to resubscribe' },
      { status: 500 }
    );
  }
}

