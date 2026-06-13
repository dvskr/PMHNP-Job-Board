import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { generateInvoice } from '@/lib/invoice-generator';
import { config, PricingTier } from '@/lib/config';

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

/**
 * GET /api/employer/invoice?jobId=...&[chargeId=...]&[token=...]
 *
 * Audit #2: Invoice generation now reads from the JobCharge ledger so the
 * invoice amount matches what Stripe actually billed. Without `chargeId`,
 * returns the most-recent charge for the posting (typically the renewal if
 * one exists, otherwise the original new-post charge). With `chargeId`,
 * returns that specific charge's invoice — useful for posts that have been
 * renewed multiple times.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');
    const token = searchParams.get('token');
    const chargeId = searchParams.get('chargeId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing required parameter: jobId' },
        { status: 400 }
      );
    }

    // Support both token-based and session-based access
    let employerJob;

    if (token) {
      // Token-based access (from email links)
      employerJob = await prisma.employerJob.findFirst({
        where: {
          jobId,
          OR: [
            { dashboardToken: token },
            { editToken: token },
          ],
        },
        include: {
          job: {
            select: { id: true, title: true, isFeatured: true, createdAt: true },
          },
        },
      });
    } else {
      // Session-based access (logged-in employer)
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized — provide a token or log in' }, { status: 401 });
      }

      employerJob = await prisma.employerJob.findFirst({
        where: {
          jobId,
          // P5.A: the contactEmail fallback is restricted to legacy rows with
          // no claimed userId — otherwise a user whose verified email equals a
          // job's contactEmail could pull another account's invoice PDF.
          OR: [
            { userId: user.id },
            { userId: null, contactEmail: user.email! },
          ],
        },
        include: {
          job: {
            select: { id: true, title: true, isFeatured: true, createdAt: true },
          },
        },
      });
    }

    if (!employerJob) {
      return NextResponse.json(
        { error: 'Invoice not found or access denied' },
        { status: 404 }
      );
    }

    // Block invoice generation for free posts
    if (employerJob.paymentStatus === 'free' ||
      employerJob.paymentStatus === 'free_renewed' ||
      employerJob.paymentStatus === 'free_upgraded') {
      return NextResponse.json(
        {
          error: 'Invoices are not available for free job postings.',
          message: 'Your job was posted during our free launch period. No payment was made, so no invoice is available.'
        },
        { status: 400 }
      );
    }

    if (employerJob.paymentStatus !== 'paid') {
      return NextResponse.json(
        { error: 'Invoice not available - payment not completed' },
        { status: 400 }
      );
    }

    // Audit #2: pull the actual charge from the ledger.
    const charge = chargeId
      ? await prisma.jobCharge.findFirst({
          where: { id: chargeId, employerJobId: employerJob.id },
        })
      : await prisma.jobCharge.findFirst({
          where: { employerJobId: employerJob.id },
          orderBy: { createdAt: 'desc' },
        });

    // 2026-05-15: refresh the invoice URL from Stripe live before redirecting.
    //
    // Stripe's `invoice.invoice_pdf` is a versioned URL — its content is
    // frozen at the moment of generation. The webhook captures it during
    // `checkout.session.completed` when the invoice is in `open` status,
    // so the cached URL serves the "amount due" PDF.
    //
    // The `invoice.paid` webhook handler refreshes the cached URL once
    // Stripe transitions to paid (~500ms later), but if that event was
    // missed (subscription gap, webhook downtime, local dev without
    // `stripe listen`), the cached URL stays stale forever.
    //
    // This live refresh hits the Stripe API once per download to get the
    // current PDF URL. ~50ms latency is worth it for "the customer
    // always downloads the right PDF".
    if (charge?.stripeInvoiceId) {
      const stripe = getStripe();
      if (stripe) {
        try {
          const invoice = await stripe.invoices.retrieve(charge.stripeInvoiceId);
          const freshPdfUrl = invoice.invoice_pdf ?? null;
          const freshHostedUrl = invoice.hosted_invoice_url ?? null;

          // Write the refreshed URL back to JobCharge so the next request
          // can short-circuit AND so the email's stable link resolves to
          // the same fresh URL.
          if (freshPdfUrl && freshPdfUrl !== charge.invoicePdfUrl) {
            await prisma.jobCharge.update({
              where: { id: charge.id },
              data: {
                invoicePdfUrl: freshPdfUrl,
                hostedInvoiceUrl: freshHostedUrl ?? charge.hostedInvoiceUrl,
                invoiceNumber: invoice.number ?? charge.invoiceNumber,
              },
            });
          }

          if (freshPdfUrl) {
            return NextResponse.redirect(freshPdfUrl, { status: 302 });
          }
        } catch (stripeErr) {
          logger.warn('Live Stripe invoice refresh failed — falling back to cached URL', {
            invoiceId: charge.stripeInvoiceId,
            error: stripeErr instanceof Error ? stripeErr.message : String(stripeErr),
          });
          // Fall through to cached URL
        }
      }
    }

    if (charge?.invoicePdfUrl) {
      return NextResponse.redirect(charge.invoicePdfUrl, { status: 302 });
    }
    if (charge?.hostedInvoiceUrl) {
      // hosted_invoice_url is the Stripe-hosted invoice page (HTML), which has
      // its own "Download invoice" button. Better than nothing for charges
      // where invoice_pdf wasn't returned by the API at webhook time.
      return NextResponse.redirect(charge.hostedInvoiceUrl, { status: 302 });
    }

    // Backfill case: rows paid before 2026-04-30 don't have JobCharge entries
    // (or have a JobCharge but no invoice URLs because the webhook didn't
    // persist them at the time). Fall back to the local PDF generator so old
    // paid posts still get an invoice instead of 404'ing.
    const tier = (employerJob.pricingTier || 'pro') as PricingTier;
    const amount = charge?.amountCents ?? config.getStripePriceInCents(tier);
    const chargeDate = charge?.createdAt ?? new Date(employerJob.createdAt);
    const chargeType = charge?.type ?? 'new';

    // Invoice number — include charge type + a short charge ID slice so renewals
    // get distinct invoice numbers from the original charge on the same job.
    const idSegment = charge?.id?.substring(0, 8).toUpperCase() ?? employerJob.job.id.substring(0, 8).toUpperCase();
    const invoiceNumber = charge?.invoiceNumber
      ?? `INV-${chargeDate.getFullYear()}-${chargeType.toUpperCase()}-${idSegment}`;

    const pdfBuffer = await generateInvoice({
      invoiceNumber,
      date: chargeDate,
      employerName: employerJob.employerName,
      employerEmail: employerJob.contactEmail,
      jobTitle: employerJob.job.title,
      amount,
      tier,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${invoiceNumber}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    logger.error('Error generating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to generate invoice' },
      { status: 500 }
    );
  }
}

