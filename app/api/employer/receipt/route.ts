import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/employer/receipt?jobId=...&[chargeId=...]&[token=...]
 *
 * Stripe-served receipt URL. Companion to /api/employer/invoice — the
 * latter serves the formal "Invoice" PDF (which Stripe doesn't always
 * regenerate to a "Paid" stamp in test mode), while this serves the
 * "Receipt" hosted page which always reflects current paid state with
 * a built-in Download button.
 *
 * Returns 302 → Stripe's `charge.receipt_url` (HTML page, paid by
 * definition since charges only exist when payment cleared).
 *
 * Auth mirrors the invoice route: token (email link) OR logged-in
 * session ownership check.
 */
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');
    const token = searchParams.get('token');
    const chargeId = searchParams.get('chargeId');

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    let employerJob;
    if (token) {
      employerJob = await prisma.employerJob.findFirst({
        where: { jobId, OR: [{ dashboardToken: token }, { editToken: token }] },
      });
    } else {
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized — provide a token or log in' }, { status: 401 });
      }
      employerJob = await prisma.employerJob.findFirst({
        where: { jobId, OR: [{ userId: user.id }, { contactEmail: user.email! }] },
      });
    }

    if (!employerJob) {
      return NextResponse.json({ error: 'Receipt not found or access denied' }, { status: 404 });
    }
    if (employerJob.paymentStatus !== 'paid') {
      return NextResponse.json({ error: 'Receipt not available — payment not completed' }, { status: 400 });
    }

    const charge = chargeId
      ? await prisma.jobCharge.findFirst({ where: { id: chargeId, employerJobId: employerJob.id } })
      : await prisma.jobCharge.findFirst({
          where: { employerJobId: employerJob.id },
          orderBy: { createdAt: 'desc' },
        });

    if (!charge) {
      return NextResponse.json({ error: 'No charge on file — cannot resolve receipt' }, { status: 404 });
    }

    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    // 2026-05-15: redirect to `hosted_invoice_url` instead of
    // `charge.receipt_url`.
    //
    // `charge.receipt_url` is an HTML-only Stripe-hosted page (per
    // Stripe docs). It shows "Paid" with payment method but offers
    // no download — the user can only view it in browser.
    //
    // `hosted_invoice_url` is the Stripe-hosted invoice page that's
    // *also* state-aware (shows "Invoice paid $X") but exposes two
    // download buttons: "Download invoice" (PDF) and "Download receipt"
    // (PDF). Clicking either triggers a real PDF download via Stripe's
    // own UI, so we don't need to host PDF rendering ourselves.
    //
    // Prefer the live URL from Stripe over the cached one — that way
    // if the invoice state changed (paid → refunded) the user sees
    // the current state, not a stale token.
    const inv = charge.stripeInvoiceId
      ? await stripe.invoices.retrieve(charge.stripeInvoiceId).catch(() => null)
      : null;
    const hostedUrl =
      inv?.hosted_invoice_url ?? charge.hostedInvoiceUrl ?? null;

    if (!hostedUrl) {
      return NextResponse.json(
        { error: 'No Stripe-hosted invoice/receipt page for this charge.' },
        { status: 404 },
      );
    }

    return NextResponse.redirect(hostedUrl, { status: 302 });
  } catch (error) {
    logger.error('Error resolving receipt URL', error);
    return NextResponse.json({ error: 'Failed to resolve receipt URL' }, { status: 500 });
  }
}
