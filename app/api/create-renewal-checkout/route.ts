import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { config, PricingTier } from '@/lib/config';
import { sendRenewalConfirmationEmail } from '@/lib/email-service';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { renewalRunwayDays } from '@/lib/expires-at';

// Lazy Stripe client — see app/api/create-checkout/route.ts for rationale.
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

/**
 * How long after a successful renewal this endpoint refuses another one for
 * the same posting. Long enough to cover the "land back on the dashboard and
 * click the still-visible Renew control" window, short enough that a genuine
 * second renewal is only a wait away.
 */
const RECENT_RENEWAL_LOCKOUT_MINUTES = 60;

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
            // Needed for the 365-day renewal cap check below.
            createdAt: true,
            expiresAt: true,
            // Needed for the double-charge guard below.
            lastRenewedAt: true,
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
    // place. 'pending' = checkout abandoned. 'free' = a legacy row from the
    // retired free-post model; a renewal would relist it without it ever having
    // been paid for. Both re-enter checkout instead of buying a renewal.
    if (employerJob.paymentStatus === 'pending') {
      return NextResponse.json(
        { error: 'This job posting was never completed. Please complete the original checkout instead of renewing.' },
        { status: 409 }
      );
    }
    if (employerJob.paymentStatus === 'free') {
      return NextResponse.json(
        { error: 'This posting was never paid for, so it cannot be renewed at the discounted rate. Please post a new listing instead.' },
        { status: 409 }
      );
    }
    // A refunded posting was pulled (refund/moderation). The renewal webhook
    // unconditionally re-publishes + flips paymentStatus to 'paid', which would
    // bypass the refund-unpublish moderation gate (toggle-publish 402s these).
    // Block renewal so a refunded post can't quietly relist at the discount.
    if (employerJob.paymentStatus === 'refunded') {
      return NextResponse.json(
        { error: 'This posting was refunded and is no longer eligible for renewal. Please contact support or create a new posting.' },
        { status: 409 }
      );
    }
    // A chargeback ('disputed') unpublishes the posting and strips its featured
    // entitlements. The renewal webhook re-publishes and re-features whatever it
    // is handed, so letting a disputed posting through here would buy the
    // revocation back at the renewal price while the bank case is still open.
    if (employerJob.paymentStatus === 'disputed') {
      return NextResponse.json(
        { error: 'This posting has an open payment dispute, so it cannot be renewed. Please contact support to resolve the dispute first.' },
        { status: 409 }
      );
    }

    // Double-charge guard. Every route back from a completed renewal (the
    // renewal-success page, the confirmation email, a browser back button onto
    // a cached dashboard) lands the employer next to a renew control for the
    // posting they just paid for. The runway they bought is already on the
    // listing, so a second charge inside the lockout is a mistake, not an
    // intent. A deliberate second renewal is only a wait away.
    const lastRenewedAt = employerJob.job?.lastRenewedAt ?? null;
    if (lastRenewedAt) {
      const minutesSinceRenewal = (Date.now() - lastRenewedAt.getTime()) / 60000;
      if (minutesSinceRenewal >= 0 && minutesSinceRenewal < RECENT_RENEWAL_LOCKOUT_MINUTES) {
        return NextResponse.json(
          {
            error: `This posting was renewed in the last ${RECENT_RENEWAL_LOCKOUT_MINUTES} minutes and the extra time is already on it. Check your dashboard for the new expiry date, or contact support if something looks wrong.`,
          },
          { status: 409 }
        );
      }
    }

    // Single-tier: every renewal is the renewal price, whatever the original
    // post was charged at.
    const price = config.priceInCentsFor('renewal');
    const renewalSavingPercent = Math.round(
      (1 - config.renewalPrice / config.postingPrice) * 100,
    );
    const tier: PricingTier = 'pro'; // Single-tier model

    // Renewal expiry is capped at 365 days from the ORIGINAL post date. Once a
    // posting reaches that cap there is no live time left to sell: the webhook
    // would take the payment and set an expiry at (or before) today, and the
    // twice-daily cleanup would unpublish the listing within hours. Refuse the
    // charge here rather than let the employer discover it after paying.
    const runwayDays = renewalRunwayDays({
      currentExpiry: employerJob.job?.expiresAt ?? null,
      originalCreatedAt: employerJob.job?.createdAt ?? employerJob.createdAt,
      durationDays: config.getDurationDays(tier),
    });
    if (runwayDays < 1) {
      return NextResponse.json(
        {
          error:
            'This posting has reached the maximum listing period of one year. Please create a new posting instead of renewing.',
        },
        { status: 409 }
      );
    }

    // Days this renewal will ACTUALLY deliver. Near the one-year cap the
    // renewal is truncated, and the price does not drop, so the buyer has to
    // read the real number before paying rather than a flat promise of
    // config.durationDays that the cap cannot keep. Refusing outright is
    // wrong too: a short renewal is still worth buying if the employer knows
    // it is short, and only they can weigh that against a fresh posting.
    const deliveredDays = Math.min(config.durationDays, Math.floor(runwayDays));
    const isTruncated = deliveredDays < config.durationDays;
    const renewalTerm = isTruncated
      ? `Renew for ${deliveredDays} days. This posting reaches the one-year maximum listing period then, so a full ${config.durationDays} days is not available. A new posting starts a fresh term.`
      : `Renew for ${config.durationDays} days, ${renewalSavingPercent}% off the standard post price.`;

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Job Renewal: ${employerJob.job.title}`,
              description: `${employerJob.job.employer}. ${renewalTerm}`,
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
          description: `Job Renewal: ${employerJob.job.title}, ${employerJob.job.employer}`,
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

    // Sec3 fix (2026-06-01): same cookie-binding pattern as
    // /api/create-checkout. /api/verify-renewal-session now requires
    // this cookie before handing out the dashboardToken. Without it,
    // anyone who learned a session_id (browser history, referer
    // headers) could harvest the management token for a renewed job.
    const response = NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
    response.cookies.set('pmhnp_renewal_session', session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60,
    });
    return response;
  } catch (error) {
    console.error('Error creating renewal checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

