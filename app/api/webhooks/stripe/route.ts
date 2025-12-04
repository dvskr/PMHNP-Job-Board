import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { sendConfirmationEmail } from '@/lib/email-service';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('stripe-signature')!;

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Handle checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      
      const jobId = session.metadata?.jobId;
      
      if (!jobId) {
        console.error('No job ID in session metadata');
        return NextResponse.json(
          { error: 'Missing job ID' },
          { status: 400 }
        );
      }

      try {
        // Update job to published
        const job = await prisma.job.update({
          where: { id: jobId },
          data: { isPublished: true },
        });

        // Update employer job payment status and get the record
        const employerJob = await prisma.employerJob.findFirst({
          where: { jobId: jobId },
        });

        if (employerJob) {
          await prisma.employerJob.update({
            where: { id: employerJob.id },
            data: { paymentStatus: 'paid' },
          });

          // Send confirmation email
          try {
            await sendConfirmationEmail(
              employerJob.contactEmail,
              job.title,
              job.id,
              employerJob.editToken
            );
          } catch (emailError) {
            console.error('Failed to send confirmation email:', emailError);
            // Don't throw - job already created
          }
        }

        console.log('Job published:', jobId);
      } catch (prismaError) {
        console.error('Error updating job in database:', prismaError);
        return NextResponse.json(
          { error: 'Failed to update job' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
