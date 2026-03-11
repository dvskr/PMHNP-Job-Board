import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { config, PricingTier } from '@/lib/config';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface UpgradeCheckoutBody {
  jobId: string;
  editToken: string;
  targetTier?: PricingTier; // 'growth' or 'premium'
}

export async function POST(request: NextRequest) {
  try {
    const body: UpgradeCheckoutBody = await request.json();
    const { jobId, editToken, targetTier } = body;

    // Validate required fields
    if (!jobId || !editToken) {
      return NextResponse.json(
        { error: 'Missing required fields: jobId and editToken' },
        { status: 400 }
      );
    }

    // Find the employer job and verify edit token
    const employerJob = await prisma.employerJob.findFirst({
      where: {
        jobId,
        editToken,
      },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            employer: true,
            location: true,
            isFeatured: true,
            isPublished: true,
            expiresAt: true,
          },
        },
      },
    });

    if (!employerJob) {
      return NextResponse.json(
        { error: 'Invalid job ID or edit token' },
        { status: 404 }
      );
    }

    const { job, dashboardToken } = employerJob;
    const currentTier = (employerJob.pricingTier || 'starter') as PricingTier;

    // Determine the target upgrade tier
    const upgradeTo: PricingTier = targetTier || 'growth';

    // Validate upgrade path
    const tierRank: Record<string, number> = { starter: 1, growth: 2, premium: 3 };
    if (tierRank[upgradeTo] <= tierRank[currentTier]) {
      return NextResponse.json(
        { error: `Already on ${config.getTierLabel(currentTier)} tier — can only upgrade to a higher tier` },
        { status: 400 }
      );
    }

    // Check if job is published
    if (!job.isPublished) {
      return NextResponse.json(
        { error: 'Job must be published before upgrading' },
        { status: 400 }
      );
    }

    // Calculate extra listing days (difference between tiers)
    const extraDays = config.getDurationDays(upgradeTo) - config.getDurationDays(currentTier);
    const newExpiresAt = job.expiresAt ? new Date(job.expiresAt) : new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + extraDays);

    if (config.isPaidPostingEnabled) {
      // PAID MODE: Stripe checkout

      // Calculate upgrade price (difference between tiers)
      const upgradePrice = config.getUpgradePrice(currentTier, upgradeTo);
      const upgradePriceCents = upgradePrice * 100;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Upgrade to ${config.getTierLabel(upgradeTo)}`,
                description: `${job.title} - ${job.employer}`,
              },
              unit_amount: upgradePriceCents,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/employer/upgrade-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/employer/dashboard/${dashboardToken}`,
        metadata: {
          jobId: job.id,
          type: 'upgrade',
          tier: upgradeTo,
          fromTier: currentTier,
        },
      });

      return NextResponse.json({
        sessionId: session.id,
        url: session.url,
      });
    } else {
      // FREE MODE: Upgrade directly without payment

      // Update job
      await prisma.job.update({
        where: { id: jobId },
        data: {
          isFeatured: config.isFeaturedTier(upgradeTo),
          expiresAt: newExpiresAt,
        },
      });

      // Update employer job record
      await prisma.employerJob.update({
        where: { jobId },
        data: {
          paymentStatus: 'free_upgraded',
          pricingTier: upgradeTo,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Job upgraded to ${config.getTierLabel(upgradeTo)}!`,
        free: true,
      });
    }
  } catch (error) {
    console.error('Error creating upgrade checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
