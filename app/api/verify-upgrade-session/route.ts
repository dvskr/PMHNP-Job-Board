import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { config, PricingTier } from '@/lib/config';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET(request: NextRequest) {
  try {
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

    // Get job ID and tier from metadata
    const jobId = session.metadata?.jobId;
    const type = session.metadata?.type;
    const tier = (session.metadata?.tier || 'growth') as PricingTier;

    if (!jobId || type !== 'upgrade') {
      return NextResponse.json(
        { error: 'Invalid upgrade session' },
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

    return NextResponse.json({
      success: true,
      jobTitle: employerJob.job.title,
      tier,
      tierLabel: config.getTierLabel(tier),
      expiresAt: employerJob.job.expiresAt?.toISOString() || null,
      dashboardToken: employerJob.dashboardToken,
    });
  } catch (error) {
    logger.error('Error verifying upgrade session:', error);
    return NextResponse.json(
      { error: 'Failed to verify session' },
      { status: 500 }
    );
  }
}
