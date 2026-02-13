import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { sendConfirmationEmail, sendRenewalConfirmationEmail } from '@/lib/email-service';
import { logger } from '@/lib/logger';
import { pingAllSearchEngines } from '@/lib/search-indexing';
import { anonymizeEmail } from '@/lib/server-utils';

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
      logger.error('Webhook signature verification failed', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Handle checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      const jobId = session.metadata?.jobId;
      const type = session.metadata?.type;
      const tier = session.metadata?.tier;

      if (!jobId) {
        logger.error('No job ID in session metadata', null, { sessionId: session.id });
        return NextResponse.json(
          { error: 'Missing job ID' },
          { status: 400 }
        );
      }

      // Handle renewal payment
      if (type === 'renewal') {
        try {
          // Calculate new expiry date
          const newExpiresAt = new Date();
          const daysToAdd = tier === 'featured' ? 60 : 30;
          newExpiresAt.setDate(newExpiresAt.getDate() + daysToAdd);

          // Update job
          const job = await prisma.job.update({
            where: { id: jobId },
            data: {
              expiresAt: newExpiresAt,
              isPublished: true,
              ...(tier === 'featured' && { isFeatured: true }),
            },
          });

          // Update employer job payment status
          const employerJob = await prisma.employerJob.findFirst({
            where: { jobId: jobId },
          });

          if (employerJob) {
            await prisma.employerJob.update({
              where: { id: employerJob.id },
              data: { paymentStatus: 'paid' },
            });

            // Get or create email lead for unsubscribe token
            let emailLead = await prisma.emailLead.findUnique({
              where: { email: employerJob.contactEmail },
            });

            if (!emailLead) {
              emailLead = await prisma.emailLead.create({
                data: { email: employerJob.contactEmail },
              });
            }

            // Send renewal confirmation email
            try {
              await sendRenewalConfirmationEmail(
                employerJob.contactEmail,
                job.title,
                newExpiresAt,
                employerJob.dashboardToken,
                emailLead.unsubscribeToken
              );
            } catch (emailError) {
              logger.error('Failed to send renewal confirmation email', emailError, { jobId });
              // Don't throw - job already renewed
            }
          }

          logger.info('Job renewed', { jobId, tier });

          // Ping search engines for renewed job (fire-and-forget)
          if (job.slug) {
            pingAllSearchEngines(`https://pmhnphiring.com/jobs/${job.slug}`).catch((err) =>
              logger.error('[Stripe] Background indexing ping failed (renewal)', err)
            );
          }
        } catch (prismaError) {
          logger.error('Error renewing job in database', prismaError, { jobId });
          return NextResponse.json(
            { error: 'Failed to renew job' },
            { status: 500 }
          );
        }
      } else if (type === 'upgrade') {
        // Handle upgrade to featured
        try {
          // Calculate new expiry date (add 30 days to current expiry since featured gets 60 days total)
          const currentJob = await prisma.job.findUnique({
            where: { id: jobId },
            select: { expiresAt: true },
          });

          const newExpiresAt = currentJob?.expiresAt ? new Date(currentJob.expiresAt) : new Date();
          newExpiresAt.setDate(newExpiresAt.getDate() + 30); // Add 30 days (60 total for featured vs 30 for standard)

          // Update job to featured
          const job = await prisma.job.update({
            where: { id: jobId },
            data: {
              isFeatured: true,
              expiresAt: newExpiresAt,
            },
          });

          // Get employer job
          const employerJob = await prisma.employerJob.findFirst({
            where: { jobId: jobId },
          });

          if (employerJob) {
            // Get or create email lead for unsubscribe token
            let emailLead = await prisma.emailLead.findUnique({
              where: { email: employerJob.contactEmail },
            });

            if (!emailLead) {
              emailLead = await prisma.emailLead.create({
                data: { email: employerJob.contactEmail },
              });
            }

            // Send upgrade confirmation email
            try {
              await sendConfirmationEmail(
                employerJob.contactEmail,
                `✨ ${job.title} (Upgraded to Featured)`,
                job.id,
                employerJob.editToken,
                employerJob.dashboardToken
              );
            } catch (emailError) {
              logger.error('Failed to send upgrade confirmation email', emailError, { jobId });
              // Don't throw - job already upgraded
            }
          }

          logger.info('Job upgraded to featured', { jobId });
        } catch (prismaError) {
          logger.error('Error upgrading job in database', prismaError, { jobId });
          return NextResponse.json(
            { error: 'Failed to upgrade job' },
            { status: 500 }
          );
        }
      } else {
        // Original flow: new job posting
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
                employerJob.editToken,
                employerJob.dashboardToken
              );
            } catch (emailError) {
              logger.error('Failed to send confirmation email', emailError, { jobId });
              // Don't throw - job already created
            }

            // Clean up any job drafts for this email (no longer needed)
            try {
              const deletedDrafts = await prisma.jobDraft.deleteMany({
                where: { email: employerJob.contactEmail },
              });
              if (deletedDrafts.count > 0) {
                const anonymizedEmail = anonymizeEmail(employerJob.contactEmail);
                logger.debug('Deleted drafts', { count: deletedDrafts.count, email: anonymizedEmail });
              }
            } catch (draftError) {
              logger.error('Failed to delete job drafts', draftError, { jobId });
              // Don't throw - job already created
            }
          }

          logger.info('Job published', { jobId });

          // Ping search engines for new job (fire-and-forget)
          if (job.slug) {
            pingAllSearchEngines(`https://pmhnphiring.com/jobs/${job.slug}`).catch((err) =>
              logger.error('[Stripe] Background indexing ping failed (new job)', err)
            );
          }
        } catch (prismaError) {
          logger.error('Error updating job in database', prismaError, { jobId });
          return NextResponse.json(
            { error: 'Failed to update job' },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('Webhook error', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

