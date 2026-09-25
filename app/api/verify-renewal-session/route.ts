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

/**
 * Retrieve a checkout session, treating an id Stripe does not recognise as a
 * client error rather than a server one.
 *
 * session_id comes straight off the query string, so a stale, truncated or
 * hand-edited link is an ordinary event: Stripe answers with
 * StripeInvalidRequestError, and mapping that to 500 booked every expired
 * confirmation link as a server error in logs and alerting while showing the
 * visitor a generic failure. Anything that is NOT "no such session" is still
 * a real fault and is rethrown.
 */
async function retrieveSessionOrNull(
  stripe: Stripe,
  sessionId: string,
): Promise<Stripe.Checkout.Session | null> {
  try {
    return await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    const type = (err as { type?: string })?.type;
    const code = (err as { code?: string })?.code;
    if (type === 'StripeInvalidRequestError' || code === 'resource_missing') {
      return null;
    }
    throw err;
  }
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
    const session = await retrieveSessionOrNull(stripe, sessionId);

    if (!session) {
      return NextResponse.json(
        { error: 'Renewal session not found' },
        { status: 404 }
      );
    }

    if (session.payment_status !== 'paid') {
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
            slug: true,
            expiresAt: true,
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

    // Stripe saying "paid" is not the same as the renewal having been applied.
    // The webhook is what extends expiresAt, and it can be delayed, retried,
    // or fail outright (missing EmployerJob, dedupe rollback). It records a
    // JobCharge keyed on this session id, so that row is the honest "it
    // landed" signal. /api/verify-checkout-session has had a processing state
    // for the new-post flow since audit #1; renewal reported unconditional
    // success and a hardcoded 60 days regardless of what actually happened.
    const charge = await prisma.jobCharge.findFirst({
      where: { stripeSessionId: sessionId, type: 'renewal' },
      select: { id: true },
    });

    return NextResponse.json({
      processing: !charge,
      // The real new expiry, so the page can stop asserting a fixed term.
      expiresAt: employerJob.job.expiresAt?.toISOString() ?? null,
      jobTitle: employerJob.job.title,
      // Stored slug wins. Recomputing it here produced a different URL from
      // the one the job page canonicalises to whenever the two algorithms
      // disagreed; slugify is only the fallback for legacy null-slug rows.
      jobSlug: employerJob.job.slug || slugify(employerJob.job.title, employerJob.job.id),
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

