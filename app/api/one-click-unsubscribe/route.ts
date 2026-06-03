import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

/**
 * RFC 8058 one-click unsubscribe endpoint (E1).
 *
 * Gmail/Yahoo POST `application/x-www-form-urlencoded` with body
 * `List-Unsubscribe=One-Click`; the subscriber is identified by the `?token=`
 * query param (the EmailLead.unsubscribeToken). Requirements (RFC 8058 §3):
 *   - accept POST with no human interaction
 *   - suppress the address immediately
 *   - return 2xx so the mail server does not retry
 */
export async function POST(request: NextRequest) {
  const token = new URL(request.url).searchParams.get('token');

  if (!token) {
    return new NextResponse('token required', { status: 400 });
  }

  try {
    const lead = await prisma.emailLead.findUnique({
      where: { unsubscribeToken: token },
      select: { id: true },
    });

    if (!lead) {
      // Unknown token — return 200 so the mail server does not retry, and do not
      // reveal whether the token exists.
      logger.warn('one-click-unsubscribe: token not found', { token: token.slice(0, 8) });
      return new NextResponse(null, { status: 200 });
    }

    await prisma.emailLead.update({
      where: { unsubscribeToken: token },
      // Suppress for real — isSuppressed is what isEmailSuppressed() gates on, so
      // this actually stops future bulk sends (not just the marketing opt-in flag).
      data: { isSubscribed: false, newsletterOptIn: false, isSuppressed: true },
    });

    logger.info('one-click-unsubscribe: suppressed', { token: token.slice(0, 8) });
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    logger.error('one-click-unsubscribe: error', error);
    return new NextResponse('error', { status: 500 });
  }
}

/** Mail servers only POST here; anything else is not allowed. */
export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}
