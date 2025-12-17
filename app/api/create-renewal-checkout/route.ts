import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { config } from '@/lib/config';
import { sendRenewalConfirmationEmail } from '@/lib/email-service';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface RenewalCheckoutBody {
  jobId: string;
  editToken: string;
  tier: 'standard' | 'featured';
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
    if (tier !== 'standard' && tier !== 'featured') {
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
      
      // Determine price in cents
      const price = tier === 'featured' ? 19900 : 9900; // $199 or $99

      // Create Stripe Checkout session
      const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Job Renewal - ${employerJob.job.title}`,
              description: `${tier === 'featured' ? 'Featured' : 'Standard'} renewal - ${employerJob.job.employer}`,
            },
            unit_amount: price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/employer/renewal-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/employer/dashboard/${employerJob.dashboardToken}`,
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
      // FREE MODE: Renew directly without payment
      
      // Calculate new expiry (30 days from now)
      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + 30);
      
      // Update job
      await prisma.job.update({
        where: { id: jobId },
        data: {
          expiresAt: newExpiresAt,
          isPublished: true,
        },
      });
      
      // Update employer job record
      await prisma.employerJob.update({
        where: { jobId },
        data: {
          paymentStatus: 'free_renewed',
        },
      });
      
      // Send renewal confirmation email
      try {
        await sendRenewalConfirmationEmail(
          employerJob.contactEmail,
          employerJob.job.title,
          newExpiresAt,
          employerJob.dashboardToken,
          employerJob.editToken // Using editToken as unsubscribe token
        );
      } catch (e) {
        console.error('Failed to send renewal email:', e);
      }
      
      return NextResponse.json({
        success: true,
        message: 'Job renewed successfully for another 30 days',
        free: true,
        newExpiresAt,
      });
    }
  } catch (error) {
    console.error('Error creating renewal checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

