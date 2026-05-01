import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { config, PricingTier } from '@/lib/config';
import { sendRenewalConfirmationEmail } from '@/lib/email-service';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

// Lazy Stripe client — see app/api/create-checkout/route.ts for rationale.
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

interface RenewalCheckoutBody {
  jobId: string;
  editToken: string;
  tier?: PricingTier; // ignored — single tier model
}

export async function POST(request: NextRequest) {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'renewal-checkout', RATE_LIMITS.postJob);
    if (rateLimitResult) return rateLimitResult;

  try {
    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        { error: 'Paid checkout is currently unavailable' },
        { status: 503 }
      );
    }

    const body: RenewalCheckoutBody = await request.json();
    const { jobId, editToken } = body;

    // Validate required fields
    if (!jobId || !editToken) {
      return NextResponse.json(
        { error: 'Missing required fields' },
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

    // Audit #11: don't allow renewing a posting that was never paid in the first
    // place. 'pending' = checkout abandoned. 'free' = the free quota path; renewing
    // a free post via the renewal flow would let it sneak past the 2-free quota.
    // Both should re-enter the appropriate flow rather than buying a $179 renewal.
    if (employerJob.paymentStatus === 'pending') {
      return NextResponse.json(
        { error: 'This job posting was never completed. Please complete the original checkout instead of renewing.' },
        { status: 409 }
      );
    }
    if (employerJob.paymentStatus === 'free') {
      return NextResponse.json(
        { error: 'Free posts cannot be renewed at the discounted rate. Post a new job at the regular price instead.' },
        { status: 409 }
      );
    }

    // Single-tier: all renewals cost $179 (10% off $199)
    const price = config.stripeRenewalPriceInCents;
    const tier: PricingTier = 'pro'; // Single-tier model

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Job Renewal - ${employerJob.job.title}`,
              description: `Renew for ${config.durationDays} days (Save 10%) - ${employerJob.job.employer}`,
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
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
      // Force Stripe receipt regardless of dashboard toggle — see comment in
      // /api/create-checkout for rationale.
      payment_intent_data: {
        receipt_email: employerJob.contactEmail,
      },
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `Job Renewal: ${employerJob.job.title} — ${employerJob.job.employer}`,
          metadata: {
            jobId,
            employerJobId: employerJob.id,
            type: 'renewal',
          },
          rendering_options: { amount_tax_display: 'exclude_tax' },
        },
      },
      metadata: {
        jobId,
        type: 'renewal',
        tier,
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: 'Checkout session created but URL is missing' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Error creating renewal checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

