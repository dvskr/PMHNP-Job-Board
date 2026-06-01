import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { slugify } from '@/lib/utils';

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export async function GET(request: NextRequest) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing session ID' },
        { status: 400 }
      );
    }

    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session || session.payment_status !== 'paid') {
      return NextResponse.json(
        { error: 'Invalid or unpaid session' },
        { status: 400 }
      );
    }

    // Get job ID from metadata
    const jobId = session.metadata?.jobId;
    const type = session.metadata?.type;
    const tier = session.metadata?.tier;

    if (!jobId || type !== 'renewal') {
      return NextResponse.json(
        { error: 'Invalid renewal session' },
        { status: 400 }
      );
    }

    // Get job and employer details
    const employerJob = await prisma.employerJob.findFirst({
      where: { jobId },
      include: {
        job: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!employerJob) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Sec3 fix (2026-06-01): cookie-bind the dashboardToken. The new-post
    // /api/verify-checkout-session was patched against this same leak
    // ages ago (H1) but renewal was missed. session_id appears in URLs,
    // referer headers, and browser histories — anyone who learns one
    // could call this endpoint and harvest the management token (which
    // grants edit + unpublish access to the renewed posting). Cookie
    // is set by /api/create-renewal-checkout. The confirmation email
    // sent by the webhook is the authoritative delivery channel.
    const renewalCookie = request.cookies.get('pmhnp_renewal_session')?.value;
    const cookieMatches = renewalCookie === sessionId;

    return NextResponse.json({
      jobTitle: employerJob.job.title,
      jobSlug: slugify(employerJob.job.title, employerJob.job.id),
      tier: tier || 'pro',
      ...(cookieMatches
        ? { dashboardToken: employerJob.dashboardToken }
        : { tokenDeliveredViaEmail: true }),
    });
  } catch (error) {
    logger.error('Error verifying renewal session:', error);
    return NextResponse.json(
      { error: 'Failed to verify session' },
      { status: 500 }
    );
  }
}

