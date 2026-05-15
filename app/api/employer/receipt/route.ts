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

    if (!charge?.stripePaymentIntentId) {
      return NextResponse.json({ error: 'No payment intent on file — cannot resolve receipt' }, { status: 404 });
    }

    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    // PaymentIntent → latest_charge → receipt_url. Stripe's receipt URL
    // is the canonical "Paid" page for the charge; safe to hand to the
    // browser regardless of invoice state.
    const pi = await stripe.paymentIntents.retrieve(charge.stripePaymentIntentId, {
      expand: ['latest_charge'],
    });
    const latestCharge =
      typeof pi.latest_charge === 'object' && pi.latest_charge !== null
        ? (pi.latest_charge as Stripe.Charge)
        : null;
    const receiptUrl = latestCharge?.receipt_url ?? null;

    if (!receiptUrl) {
      return NextResponse.json({ error: 'Stripe has not generated a receipt for this charge yet.' }, { status: 404 });
    }

    return NextResponse.redirect(receiptUrl, { status: 302 });
  } catch (error) {
    logger.error('Error resolving receipt URL', error);
    return NextResponse.json({ error: 'Failed to resolve receipt URL' }, { status: 500 });
  }
}
