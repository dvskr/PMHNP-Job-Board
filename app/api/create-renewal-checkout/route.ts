import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { config, PricingTier } from '@/lib/config';
import { sendRenewalConfirmationEmail } from '@/lib/email-service';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface RenewalCheckoutBody {
  jobId: string;
  editToken: string;
  tier: PricingTier;
}

export async function POST(request: NextRequest) {
  try {
    const body: RenewalCheckoutBody = await request.json();
    const { jobId, editToken, tier } = body;

    // Validate required fields
    if (!jobId || !editToken || !tier) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate tier
    if (tier !== 'starter' && tier !== 'growth' && tier !== 'premium') {
      return NextResponse.json(
        { error: 'Invalid pricing tier' },
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

    // Check if free mode is enabled
    if (config.isPaidPostingEnabled) {
      // PAID MODE: Existing Stripe checkout flow

      // Determine renewal price in cents from config (20% discount)
      const price = config.getStripeRenewalPriceInCents(tier);

      // Create Stripe Checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Job Renewal - ${employerJob.job.title}`,
                description: `${config.getTierLabel(tier)} renewal (Save 20%) - ${employerJob.job.employer}`,
              },
              unit_amount: price,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/employer/renewal-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/employer/dashboard`,
        customer_email: employerJob.contactEmail,
        metadata: {
          jobId,
          type: 'renewal',
          tier,
        },
      });

      return NextResponse.json({
        sessionId: session.id,
        url: session.url,
      });
    } else {
      // FREE MODE: Renewals not available during free launch
      return NextResponse.json(
        { error: 'Renewals are available when paid plans are enabled. During the free launch, you can post a new job for free instead.' },
        { status: 403 }
      );
    }
  } catch (error) {
    console.error('Error creating renewal checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

