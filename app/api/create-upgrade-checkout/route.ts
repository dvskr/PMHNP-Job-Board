import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface UpgradeCheckoutBody {
  jobId: string;
  editToken: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: UpgradeCheckoutBody = await request.json();
    const { jobId, editToken } = body;

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

    // Check if job is already featured
    if (job.isFeatured) {
      return NextResponse.json(
        { error: 'This job is already featured' },
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

    // Create Stripe Checkout session for upgrade
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Upgrade to Featured Job',
              description: `${job.title} - ${job.employer}`,
            },
            unit_amount: 10000, // $100 (difference between $199 and $99)
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
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Error creating upgrade checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

