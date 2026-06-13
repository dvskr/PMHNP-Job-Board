import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { sendConfirmationEmail, sendRenewalConfirmationEmail, sendRefundConfirmationEmail, getOrCreateUnsubToken } from '@/lib/email-service';
import { config, PricingTier } from '@/lib/config';
import { renewalExpiresAt } from '@/lib/expires-at';
import { logger } from '@/lib/logger';
import { pingAllSearchEngines } from '@/lib/search-indexing';
import { anonymizeEmail } from '@/lib/server-utils';
import { trackServerPurchase } from '@/lib/analytics-server';

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export async function POST(request: NextRequest) {
  // C2 fix (2026-06-01): tracks whether the idempotency row was committed
  // so the outer catch can roll it back. Without this, an uncaught exception
  // after the dedupe row was written leaves Stripe's retry permanently
  // blocked (P2002 → "deduped"), losing money silently.
  let dedupedEventId: string | null = null;
  try {
    const stripe = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !webhookSecret) {
      logger.error('Stripe webhook called but STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is missing', null);
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }

    // Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('stripe-signature')!;

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        webhookSecret
      );
    } catch (err) {
      logger.error('Webhook signature verification failed', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Audit #3: Idempotency dedupe. Stripe redelivers events on transient
    // failures; without this we'd double-send confirmation emails and re-run
    // state writes. We insert-then-process; on unique-violation (event already
    // processed) we return 200 so Stripe stops retrying.
    //
    // C2 fix (2026-06-01): the previous version wrote the dedupe row
    // BEFORE processing and never rolled it back on failure. A transient
    // hiccup mid-processing would leave the job unpublished, no charge
    // recorded, no receipt sent, AND Stripe's retry would hit P2002
    // ("already processed") and be silently dropped — money taken,
    // nothing delivered. Fix: any 500-returning path must first delete
    // the dedupe row so Stripe's retry can succeed. `cleanupDedupe()`
    // is called from every error path below.
    try {
      await prisma.processedStripeEvent.create({
        data: { eventId: event.id, eventType: event.type },
      });
      dedupedEventId = event.id;  // C2: enable outer-catch rollback
    } catch (dedupeErr) {
      // Prisma P2002 = unique constraint violation → already processed.
      // Any other error → log and bail conservatively (Stripe will retry).
      const code = (dedupeErr as { code?: string } | null)?.code;
      if (code === 'P2002') {
        logger.info('Stripe webhook event already processed; skipping', { eventId: event.id, eventType: event.type });
        return NextResponse.json({ received: true, deduped: true });
      }
      logger.error('Failed to record processed Stripe event', dedupeErr, { eventId: event.id });
      return NextResponse.json({ error: 'Idempotency check failed' }, { status: 500 });
    }

    // Helper: remove the dedupe row so Stripe will redeliver. Used on every
    // 500-returning code path so a transient failure can self-heal.
    // If the deletion itself fails we log and proceed; worst case Stripe's
    // retry hits P2002 and we land where we'd be without this fix.
    const cleanupDedupe = async (): Promise<void> => {
      try {
        await prisma.processedStripeEvent.delete({ where: { eventId: event.id } });
      } catch (cleanupErr) {
        logger.error('[Stripe] Failed to roll back dedupe row before 500 — Stripe retry may be silently dropped', cleanupErr, { eventId: event.id });
      }
    };

    // Helper: pull invoice URLs off a session that had `invoice_creation` enabled.
    // Returns null fields gracefully if the invoice is missing or can't be fetched —
    // payment processing must never fail because the invoice URL lookup hiccupped.
    const fetchInvoiceData = async (
      stripeClient: Stripe,
      session: Stripe.Checkout.Session
    ): Promise<{
      stripeInvoiceId: string | null;
      invoicePdfUrl: string | null;
      hostedInvoiceUrl: string | null;
      invoiceNumber: string | null;
    }> => {
      const invoiceId = typeof session.invoice === 'string' ? session.invoice : session.invoice?.id ?? null;
      if (!invoiceId) {
        return { stripeInvoiceId: null, invoicePdfUrl: null, hostedInvoiceUrl: null, invoiceNumber: null };
      }
      try {
        const invoice = await stripeClient.invoices.retrieve(invoiceId);
        return {
          stripeInvoiceId: invoice.id ?? invoiceId,
          invoicePdfUrl: invoice.invoice_pdf ?? null,
          hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
          invoiceNumber: invoice.number ?? null,
        };
      } catch (invErr) {
        logger.error('Failed to retrieve Stripe invoice for JobCharge', invErr, { invoiceId, sessionId: session.id });
        return { stripeInvoiceId: invoiceId, invoicePdfUrl: null, hostedInvoiceUrl: null, invoiceNumber: null };
      }
    };

    // Handle checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      const jobId = session.metadata?.jobId;
      const type = session.metadata?.type;
      const tier = session.metadata?.tier;

      if (!jobId) {
        logger.error('No job ID in session metadata', null, { sessionId: session.id });
        // 400 is intentional — bad payload won't get better on retry.
        // Keep dedupe in place so Stripe stops bothering us about this event.
        return NextResponse.json(
          { error: 'Missing job ID' },
          { status: 400 }
        );
      }

      // Handle renewal payment
      if (type === 'renewal') {
        try {
          // Calculate new expiry via renewalExpiresAt (UTC math, capped at 365
          // days from createdAt to prevent indefinite stacking from repeated
          // back-to-back renewals).
          //   - Extends from existing expiresAt if still in the future (audit #22)
          //   - Otherwise extends from now (late renewers don't bank dead time)
          //   - Hard cap so 6 paid renewals can't push a posting 2 years out
          const renewalTier = (tier || 'pro') as PricingTier;
          const existingJob = await prisma.job.findUnique({
            where: { id: jobId },
            select: { expiresAt: true, createdAt: true },
          });
          const newExpiresAt = renewalExpiresAt({
            currentExpiry: existingJob?.expiresAt ?? null,
            originalCreatedAt: existingJob?.createdAt ?? new Date(),
            durationDays: config.getDurationDays(renewalTier),
          });

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

          // Update employer job payment status. Audit #8: surface a loud failure
          // if the EmployerJob row is missing — previously we silently extended the
          // job without recording payment status or sending the receipt email.
          const employerJob = await prisma.employerJob.findFirst({
            where: { jobId: jobId },
          });

          if (!employerJob) {
            logger.error('Renewal webhook: EmployerJob not found for paid job', null, {
              jobId,
              sessionId: session.id,
              tier: renewalTier,
            });
            await cleanupDedupe();  // C2: let Stripe retry self-heal read-after-write lag
            return NextResponse.json(
              { error: 'EmployerJob record missing for renewed job' },
              { status: 500 }
            );
          }

          {
            await prisma.employerJob.update({
              where: { id: employerJob.id },
              // Reset expiryWarningSentAt so the renewed posting (new, later
              // expiresAt) gets its own 5-day-out warning. Without this, a job
              // warned once is permanently excluded from the expiry-warnings cron.
              data: { paymentStatus: 'paid', pricingTier: renewalTier, expiryWarningSentAt: null },
            });

            // Audit #2: record a JobCharge for this renewal so invoices reflect
            // the actual amount paid ($179 renewal vs $199 new post).
            // Audit #28: also persist payment_intent so the refund webhook can
            // match `charge.refunded` events back to this JobCharge row.
            const renewalInvoiceData = await fetchInvoiceData(stripe, session);
            try {
              await prisma.jobCharge.create({
                data: {
                  employerJobId: employerJob.id,
                  stripeSessionId: session.id,
                  stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
                  amountCents: session.amount_total ?? config.stripeRenewalPriceInCents,
                  currency: session.currency ?? 'usd',
                  type: 'renewal',
                  ...renewalInvoiceData,
                },
              });
            } catch (chargeErr) {
              // Idempotency on stripeSessionId — duplicate webhooks shouldn't fail the flow.
              const code = (chargeErr as { code?: string } | null)?.code;
              if (code !== 'P2002') {
                logger.error('Failed to record JobCharge for renewal', chargeErr, { jobId });
              }
            }

            // Get or create email lead for unsubscribe token
            let emailLead = await prisma.emailLead.findUnique({
              where: { email: employerJob.contactEmail },
            });

            if (!emailLead) {
              emailLead = await prisma.emailLead.create({
                data: { email: employerJob.contactEmail },
              });
            }

            // Send renewal confirmation email. Same stable-URL pattern as
            // the new-post flow (see comment in the else-branch below) —
            // link to our dashboard endpoint so the recipient always gets
            // the latest "Paid"-stamped PDF, not the open-state PDF
            // captured before invoice.paid fires.
            const renewalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? '';
            const stableRenewalInvoiceUrl = renewalBaseUrl
              ? `${renewalBaseUrl}/api/employer/invoice?jobId=${jobId}&token=${employerJob.dashboardToken}`
              : null;

            try {
              await sendRenewalConfirmationEmail(
                employerJob.contactEmail,
                job.title,
                newExpiresAt,
                employerJob.dashboardToken,
                emailLead.unsubscribeToken,
                {
                  invoicePdfUrl: stableRenewalInvoiceUrl,
                  hostedInvoiceUrl: renewalInvoiceData.hostedInvoiceUrl,
                  invoiceNumber: renewalInvoiceData.invoiceNumber,
                }
              );
            } catch (emailError) {
              logger.error('Failed to send renewal confirmation email', emailError, { jobId });
              // Don't throw - job already renewed
            }
          }

          logger.info('Job renewed', { jobId, tier });

          // P7: server-side purchase event (fire-and-forget)
          trackServerPurchase({
            clientId: jobId,
            sessionId: session.id,
            amountCents: session.amount_total ?? config.stripeRenewalPriceInCents,
            currency: session.currency ?? 'usd',
            type: 'renewal',
            tier: renewalTier,
            jobId,
          }).catch(() => { /* logged inside */ });

          // Ping search engines for renewed job (fire-and-forget)
          if (job.slug) {
            pingAllSearchEngines(`https://pmhnphiring.com/jobs/${job.slug}`).catch((err) =>
              logger.error('[Stripe] Background indexing ping failed (renewal)', err)
            );
          }
        } catch (prismaError) {
          logger.error('Error renewing job in database', prismaError, { jobId });
          await cleanupDedupe();  // C2: let Stripe retry succeed
          return NextResponse.json(
            { error: 'Failed to renew job' },
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

          if (!employerJob) {
            // C3 fix: previously a missing EmployerJob row caused this
            // branch to be skipped silently — `isPublished` was set to
            // true, no JobCharge was recorded, no confirmation email was
            // sent, and the handler returned 200. Stripe never retried
            // and the money was effectively unrecorded.
            //
            // Returning 500 makes Stripe redeliver the event so the
            // condition (e.g. transient DB read-after-write lag) can
            // self-heal. The job row's `isPublished=true` write above
            // stays — it's idempotent and a republish on retry is fine.
            logger.error('[Stripe] EmployerJob not found for paid checkout — returning 500 so Stripe retries', undefined, {
              jobId,
              sessionId: session.id,
            });
            await cleanupDedupe();  // C2: roll back dedupe so Stripe retry actually replays
            return NextResponse.json(
              { error: 'EmployerJob not found for paid session' },
              { status: 500 },
            );
          }

          {
            const paidTier = session.metadata?.pricing || 'pro';
            await prisma.employerJob.update({
              where: { id: employerJob.id },
              data: { paymentStatus: 'paid', pricingTier: paidTier },
            });

            // Audit #2: record JobCharge for the new-post payment.
            // Audit #28: also persist payment_intent so the refund webhook can
            // match `charge.refunded` events back to this JobCharge row.
            const newPostInvoiceData = await fetchInvoiceData(stripe, session);
            try {
              await prisma.jobCharge.create({
                data: {
                  employerJobId: employerJob.id,
                  stripeSessionId: session.id,
                  stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
                  amountCents: session.amount_total ?? config.stripePriceInCents,
                  currency: session.currency ?? 'usd',
                  type: 'new',
                  ...newPostInvoiceData,
                },
              });
            } catch (chargeErr) {
              const code = (chargeErr as { code?: string } | null)?.code;
              if (code !== 'P2002') {
                logger.error('Failed to record JobCharge for new post', chargeErr, { jobId });
              }
            }

            // Send confirmation email.
            //
            // 2026-05-15 fix: this email fires inside `checkout.session.completed`,
            // BEFORE Stripe transitions the invoice to "paid". If we pass
            // `invoicePdfUrl` directly, the recipient may download an
            // "amount due" PDF. Instead, link to our dashboard invoice
            // endpoint — it 302-redirects to whatever URL is currently in
            // JobCharge.invoicePdfUrl. The `invoice.paid` handler updates
            // that URL within a few hundred ms, so by the time the user
            // clicks the email link they get the "Paid" PDF.
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? '';
            const stableInvoiceUrl = baseUrl
              ? `${baseUrl}/api/employer/invoice?jobId=${job.id}&token=${employerJob.dashboardToken}`
              : null;

            try {
              await sendConfirmationEmail(
                employerJob.contactEmail,
                job.title,
                job.id,
                employerJob.dashboardToken,
                undefined, // unsubscribeToken — sendConfirmationEmail looks it up by email
                undefined, // durationDays — paid posts use config.durationDays default
                {
                  invoicePdfUrl: stableInvoiceUrl,
                  hostedInvoiceUrl: newPostInvoiceData.hostedInvoiceUrl,
                  invoiceNumber: newPostInvoiceData.invoiceNumber,
                }
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

          // P7: server-side purchase event (fire-and-forget)
          trackServerPurchase({
            clientId: jobId,
            sessionId: session.id,
            amountCents: session.amount_total ?? config.stripePriceInCents,
            currency: session.currency ?? 'usd',
            type: 'new',
            tier: session.metadata?.pricing,
            jobId,
          }).catch(() => { /* logged inside */ });

          // Ping search engines for new job (fire-and-forget)
          if (job.slug) {
            pingAllSearchEngines(`https://pmhnphiring.com/jobs/${job.slug}`).catch((err) =>
              logger.error('[Stripe] Background indexing ping failed (new job)', err)
            );
          }
        } catch (prismaError) {
          logger.error('Error updating job in database', prismaError, { jobId });
          await cleanupDedupe();  // C2: roll back dedupe so Stripe retry actually replays
          return NextResponse.json(
            { error: 'Failed to update job' },
            { status: 500 }
          );
        }
      }
    }

    // 2026-05-15: invoice.paid handler — refreshes the JobCharge's
    // invoicePdfUrl / hostedInvoiceUrl. We initially capture these URLs
    // during `checkout.session.completed`, but at that exact moment the
    // invoice is in `open` status — the PDF says "Pay online" and lists
    // an amount "due", not "Paid". Stripe regenerates the PDF when the
    // invoice transitions to `paid` (a few hundred ms later). Re-fetching
    // here and updating the ledger ensures the downloadable PDF always
    // shows the paid state.
    if (event.type === 'invoice.paid') {
      try {
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceId = invoice.id;
        if (!invoiceId) {
          logger.warn('invoice.paid: invoice has no id', { eventId: event.id });
          return NextResponse.json({ received: true });
        }

        const jobCharge = await prisma.jobCharge.findFirst({
          where: { stripeInvoiceId: invoiceId },
          select: { id: true },
        });

        if (!jobCharge) {
          // Not all invoices belong to a JobCharge (e.g. one-off invoices
          // sent outside the post-job flow). Safe to ignore.
          logger.info('invoice.paid: no matching JobCharge — skipping', { invoiceId });
          return NextResponse.json({ received: true });
        }

        await prisma.jobCharge.update({
          where: { id: jobCharge.id },
          data: {
            invoicePdfUrl: invoice.invoice_pdf ?? null,
            hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
            invoiceNumber: invoice.number ?? null,
          },
        });

        logger.info('JobCharge invoice URLs refreshed after invoice.paid', {
          jobChargeId: jobCharge.id,
          invoiceId,
        });
      } catch (invErr) {
        logger.error('Error handling invoice.paid webhook', invErr);
        await cleanupDedupe();  // C2
        return NextResponse.json({ error: 'Failed to refresh invoice URLs' }, { status: 500 });
      }
    }

    // Audit #28: charge.refunded handler — runs when admin issues a refund
    // from the Stripe Dashboard. Updates the JobCharge ledger, flips
    // EmployerJob.paymentStatus to 'refunded', unpublishes the job (full
    // refund only), and sends the customer a confirmation email.
    if (event.type === 'charge.refunded') {
      try {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;

        if (!paymentIntentId) {
          logger.warn('charge.refunded webhook with no payment_intent — cannot match to JobCharge', { chargeId: charge.id });
          return NextResponse.json({ received: true, note: 'no payment_intent' });
        }

        const jobCharge = await prisma.jobCharge.findUnique({
          where: { stripePaymentIntentId: paymentIntentId },
        });

        if (!jobCharge) {
          // Pre-audit-#28 charges don't have payment_intent persisted, OR
          // the refund is for a charge that originated outside our flow.
          logger.warn('charge.refunded: no matching JobCharge — pre-#28 row or external charge', { paymentIntentId, chargeId: charge.id });
          return NextResponse.json({ received: true, note: 'no matching JobCharge' });
        }

        const refundedAmount = charge.amount_refunded ?? 0;
        const isPartial = refundedAmount > 0 && refundedAmount < jobCharge.amountCents;
        const isFullRefund = refundedAmount >= jobCharge.amountCents;

        // Pull a refund reason from the latest refund object on the charge if available.
        const latestRefund = charge.refunds?.data?.[0];
        const refundReason = latestRefund?.reason ?? null;

        // Update the ledger
        await prisma.jobCharge.update({
          where: { id: jobCharge.id },
          data: {
            refundedAt: new Date(),
            refundedAmountCents: refundedAmount,
            refundReason,
          },
        });

        // Flip the EmployerJob paymentStatus + (if full refund) unpublish the job
        const employerJob = await prisma.employerJob.findUnique({
          where: { id: jobCharge.employerJobId },
          include: { job: { select: { id: true, title: true } } },
        });

        if (employerJob) {
          // Only a FULL refund revokes entitlement. A partial/goodwill refund
          // must leave paymentStatus='paid' — otherwise the customer keeps a
          // live job but permanently loses invoice/receipt downloads (those
          // 400 unless 'paid') and can never republish. The ledger row above
          // already records refundedAmountCents for accounting either way.
          if (isFullRefund) {
            await prisma.employerJob.update({
              where: { id: employerJob.id },
              data: { paymentStatus: 'refunded' },
            });
            await prisma.job.update({
              where: { id: employerJob.jobId },
              data: { isPublished: false },
            });
          } else if (isPartial) {
            logger.info('charge.refunded: partial refund — entitlement retained', {
              employerJobId: employerJob.id,
              refundedAmount,
              totalCents: jobCharge.amountCents,
            });
          }

          // Best-effort refund-confirmation email (don't fail the webhook on email errors)
          try {
            const unsubToken = await getOrCreateUnsubToken(employerJob.contactEmail);
            await sendRefundConfirmationEmail(
              employerJob.contactEmail,
              employerJob.job?.title ?? 'your job posting',
              refundedAmount,
              isPartial,
              unsubToken,
            );
          } catch (emailErr) {
            logger.error('Failed to send refund confirmation email', emailErr, { jobChargeId: jobCharge.id });
          }
        } else {
          logger.warn('charge.refunded: JobCharge has no matching EmployerJob — orphaned ledger row', { jobChargeId: jobCharge.id });
        }

        logger.info('Refund processed', {
          jobChargeId: jobCharge.id,
          refundedAmount,
          isPartial,
          isFullRefund,
          paymentIntentId,
        });
      } catch (refundErr) {
        logger.error('Error handling charge.refunded webhook', refundErr);
        await cleanupDedupe();  // C2
        return NextResponse.json({ error: 'Failed to handle refund' }, { status: 500 });
      }
    }

    // Chargeback / dispute: when a customer disputes a charge the bank pulls the
    // funds and Stripe does NOT emit charge.refunded — so without this the
    // disputed posting stayed live with paymentStatus='paid'. Revoke entitlement
    // (unpublish + mark 'disputed', which the invoice/receipt routes and
    // toggle-publish already treat as non-paid).
    // NOTE: requires `charge.dispute.created` to be enabled on the Stripe webhook
    // endpoint's event list.
    if (event.type === 'charge.dispute.created') {
      try {
        const dispute = event.data.object as Stripe.Dispute;
        const paymentIntentId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : null;
        if (!paymentIntentId) {
          logger.warn('charge.dispute.created with no payment_intent — cannot match to JobCharge', { disputeId: dispute.id });
          return NextResponse.json({ received: true, note: 'no payment_intent' });
        }

        const jobCharge = await prisma.jobCharge.findUnique({
          where: { stripePaymentIntentId: paymentIntentId },
        });
        if (!jobCharge) {
          logger.warn('charge.dispute.created: no matching JobCharge', { paymentIntentId, disputeId: dispute.id });
          return NextResponse.json({ received: true, note: 'no matching JobCharge' });
        }

        const employerJob = await prisma.employerJob.findUnique({
          where: { id: jobCharge.employerJobId },
          include: { job: { select: { id: true, title: true } } },
        });

        if (employerJob) {
          await prisma.employerJob.update({
            where: { id: employerJob.id },
            data: { paymentStatus: 'disputed' },
          });
          await prisma.job.update({
            where: { id: employerJob.jobId },
            data: { isPublished: false },
          });
          logger.warn('Chargeback: revoked posting on dispute', {
            employerJobId: employerJob.id,
            disputeId: dispute.id,
            amount: dispute.amount,
          });
        } else {
          logger.warn('charge.dispute.created: JobCharge has no matching EmployerJob', { jobChargeId: jobCharge.id });
        }
      } catch (disputeErr) {
        logger.error('Error handling charge.dispute.created webhook', disputeErr);
        await cleanupDedupe();  // C2
        return NextResponse.json({ error: 'Failed to handle dispute' }, { status: 500 });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('Webhook error', error);
    // C2: roll back the idempotency row so Stripe's retry actually runs.
    // Without this, an uncaught exception leaves the event marked
    // "processed" while the side-effects (charge ledger, email, publish
    // flip) silently never happened.
    if (dedupedEventId) {
      try {
        await prisma.processedStripeEvent.delete({ where: { eventId: dedupedEventId } });
      } catch (cleanupErr) {
        logger.error('[Stripe] Failed to roll back dedupe row in outer catch — Stripe retry may be silently dropped', cleanupErr, { eventId: dedupedEventId });
      }
    }
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

