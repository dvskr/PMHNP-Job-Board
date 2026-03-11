import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { sendConfirmationEmail, sendRenewalConfirmationEmail } from '@/lib/email-service';
import { config, PricingTier } from '@/lib/config';
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
          // Calculate new expiry date from config
          const newExpiresAt = new Date();
          const renewalTier = (tier || 'starter') as PricingTier;
          newExpiresAt.setDate(newExpiresAt.getDate() + config.getDurationDays(renewalTier));

          // Update job
          const job = await prisma.job.update({
            where: { id: jobId },
            data: {
              expiresAt: newExpiresAt,
              isPublished: true,
              isVerifiedEmployer: true,
              ...(config.isFeaturedTier(renewalTier) && { isFeatured: true }),
            },
          });

          // Update employer job payment status
          const employerJob = await prisma.employerJob.findFirst({
            where: { jobId: jobId },
          });

          if (employerJob) {
            await prisma.employerJob.update({
              where: { id: employerJob.id },
              data: { paymentStatus: 'paid', pricingTier: renewalTier },
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
        // Handle upgrade to higher tier
        try {
          const upgradeTier = (tier || 'growth') as PricingTier;

          // Get current job to determine new expiry
          const currentJob = await prisma.job.findUnique({
            where: { id: jobId },
            select: { expiresAt: true },
          });

          // Find the employer's current tier to calculate extra days
          const employerJobForTier = await prisma.employerJob.findFirst({
            where: { jobId },
            select: { pricingTier: true },
          });
          const fromTier = (employerJobForTier?.pricingTier || 'starter') as PricingTier;

          const newExpiresAt = currentJob?.expiresAt ? new Date(currentJob.expiresAt) : new Date();
          const extraDays = config.getDurationDays(upgradeTier) - config.getDurationDays(fromTier);
          newExpiresAt.setDate(newExpiresAt.getDate() + extraDays);

          // Update job
          const job = await prisma.job.update({
            where: { id: jobId },
            data: {
              isFeatured: config.isFeaturedTier(upgradeTier),
              isVerifiedEmployer: true,
              expiresAt: newExpiresAt,
            },
          });

          // Update employer job tier
          const employerJob = await prisma.employerJob.findFirst({
            where: { jobId: jobId },
          });

          if (employerJob) {
            await prisma.employerJob.update({
              where: { id: employerJob.id },
              data: { pricingTier: upgradeTier },
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

            // Send upgrade confirmation email
            try {
              await sendConfirmationEmail(
                employerJob.contactEmail,
                `✨ ${job.title} (Upgraded to ${config.getTierLabel(upgradeTier)})`,
                job.id,
                employerJob.editToken,
                employerJob.dashboardToken
              );
            } catch (emailError) {
              logger.error('Failed to send upgrade confirmation email', emailError, { jobId });
            }
          }

          logger.info(`Job upgraded to ${upgradeTier} tier`, { jobId, fromTier, upgradeTier });

          // Ping search engines for upgraded job (fire-and-forget)
          if (job.slug) {
            pingAllSearchEngines(`https://pmhnphiring.com/jobs/${job.slug}`).catch((err) =>
              logger.error('[Stripe] Background indexing ping failed (upgrade)', err)
            );
          }
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
            data: { isPublished: true, isVerifiedEmployer: true },
          });

          // Update employer job payment status and get the record
          const employerJob = await prisma.employerJob.findFirst({
            where: { jobId: jobId },
          });

          if (employerJob) {
            const paidTier = session.metadata?.pricing || 'starter';
            await prisma.employerJob.update({
              where: { id: employerJob.id },
              data: { paymentStatus: 'paid', pricingTier: paidTier },
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

