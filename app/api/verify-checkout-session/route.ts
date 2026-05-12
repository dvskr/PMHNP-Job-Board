import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

/**
 * GET /api/verify-checkout-session?session_id=cs_xxx
 *
 * Verifies a Stripe checkout session for a NEW job post (not renewal — that has
 * its own /api/verify-renewal-session endpoint). Used by /success to confirm
 * payment actually completed before showing the success state. Audit #1.
 *
 * Returns 200 with `{ paid: true, jobTitle, jobSlug, dashboardToken, isPublished }`
 * on success, or appropriate error codes:
 *   400 — missing session_id, or session is for a renewal/upgrade
 *   404 — job not found in DB
 *   402 — Stripe says session is unpaid (webhook not yet fired, or never will)
 *   503 — Stripe not configured
 */
export async function GET(request: NextRequest) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const sessionId = request.nextUrl.searchParams.get('session_id');
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // This route is for NEW job-post checkouts only. Renewal flow has a
    // different verify endpoint and writes type='renewal' on its sessions.
    if (session.metadata?.type === 'renewal' || session.metadata?.type === 'upgrade') {
      return NextResponse.json(
        { error: 'Wrong verify endpoint for this session type' },
        { status: 400 }
      );
    }

    if (session.payment_status !== 'paid') {
      return NextResponse.json(
        {
          paid: false,
          error: 'Payment not yet complete',
          paymentStatus: session.payment_status,
        },
        { status: 402 }
      );
    }

    const jobId = session.metadata?.jobId;
    if (!jobId) {
      logger.error('Verify checkout session: paid session has no jobId metadata', null, { sessionId });
      return NextResponse.json({ error: 'Session metadata missing jobId' }, { status: 400 });
    }

    const employerJob = await prisma.employerJob.findFirst({
      where: { jobId },
      select: {
        dashboardToken: true,
        paymentStatus: true,
        contactEmail: true,
        job: { select: { title: true, slug: true, isPublished: true } },
      },
    });

    if (!employerJob) {
      // Stripe says paid but our DB has no record yet. Most likely: the webhook
      // for `checkout.session.completed` hasn't fired/processed yet. Tell the
      // client to retry instead of pretending all is well.
      return NextResponse.json(
        {
          paid: true,
          processing: true,
          error: 'Payment recorded by Stripe but job not yet activated. Please refresh in a few seconds.',
        },
        { status: 202 }
      );
    }

    // SECURITY (H1): the dashboardToken grants edit/unpublish on the job.
    // session_id is not secret — it lives in URLs, referer headers, and
    // browser histories — so this endpoint must NOT hand the token to any
    // caller who happens to know a valid session_id. We bind the session
    // to the originating browser via a httpOnly cookie set in
    // /api/create-checkout. Callers without the matching cookie still
    // learn that payment succeeded (so they can render a success page)
    // but get a "check your email" hint instead of the token.
    const checkoutCookie = request.cookies.get('pmhnp_checkout_session')?.value;
    const cookieMatches = checkoutCookie === sessionId;

    return NextResponse.json({
      paid: true,
      processing: employerJob.paymentStatus !== 'paid',
      jobTitle: employerJob.job.title,
      jobSlug: employerJob.job.slug,
      isPublished: employerJob.job.isPublished,
      // Token is only returned when the cookie binding matches. The
      // confirmation email (sent by the webhook) always includes the
      // token-bearing dashboard link as the secure delivery channel.
      ...(cookieMatches
        ? { dashboardToken: employerJob.dashboardToken }
        : { tokenDeliveredViaEmail: true }),
    });
  } catch (error) {
    logger.error('Error verifying checkout session', error);
    return NextResponse.json(
      { error: 'Failed to verify checkout session' },
      { status: 500 }
    );
  }
}
