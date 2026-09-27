/**
 * Buy a pack of prepaid posting credits.
 *
 * Deliberately NOT part of create-checkout. That route creates a Job and an
 * EmployerJob in a transaction before it opens a Checkout session, and it
 * sweeps every pending row for the identity, expiring their sessions, before
 * it prices anything. A pack has no job, and modelling one as a pending
 * EmployerJob to reuse the ledger would mean an employer who opens a pack
 * checkout and then starts a normal post in another tab has their pack
 * payment killed mid-flight.
 *
 * So this route creates nothing in the database. The pack row is written by
 * the webhook on `checkout.session.completed`, keyed on the session id,
 * which is also what makes a replayed event harmless.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { verifyCsrf } from '@/lib/csrf';
import { buildQuotaKeys } from '@/lib/employer-quota';
import { brand } from '@/config/brand';

// Lazy, per-request, matching /api/create-checkout: a missing
// STRIPE_SECRET_KEY becomes a clean 503 instead of an empty-string client
// that fails later as an opaque Stripe auth error inside the generic catch.
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: '2025-11-17.clover' });
}

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || brand.baseUrl).replace(/\/$/, '');

export async function POST(req: NextRequest) {
  const csrfError = verifyCsrf(req);
  if (csrfError) return csrfError;

  const rateLimited = await rateLimit(req, 'employer:pack-checkout', RATE_LIMITS.employer);
  if (rateLimited) return rateLimited;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in to buy posting credits.' }, { status: 401 });
  }

  const profile = await prisma.userProfile.findUnique({
    where: { supabaseId: user.id },
    select: { role: true, company: true },
  });
  if (!profile || !['employer', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Employer accounts only.' }, { status: 403 });
  }

  let body: { packId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Resolved against the catalogue, never trusted. The price comes from
  // config, so a tampered body can pick a different pack but can never pick
  // a different price for one.
  const packId = typeof body.packId === 'string' ? body.packId : '';
  const pack = config.creditPackById(packId);
  if (!pack) {
    return NextResponse.json({ error: 'Unknown pack.' }, { status: 400 });
  }

  // Session-proven identity only. lib/employer-quota.ts states the rule three
  // times: nothing form-typed may become a quota key, because a form-derived
  // key lets one buyer spend a rival's entitlement. These keys are snapshotted
  // onto the pack so a team can spend what one of them bought.
  const quotaKeys = buildQuotaKeys({
    userId: user.id,
    signupEmail: user.email ?? null,
    // From the authenticated profile row, never from the request. That is
    // the stated caller contract on QuotaIdentity.
    lockedCompanyName: profile.company ?? null,
  });

  const stripe = getStripe();
  if (!stripe) {
    logger.error('Pack checkout attempted with no STRIPE_SECRET_KEY', null, { packId: pack.id });
    return NextResponse.json({ error: 'Checkout is unavailable right now.' }, { status: 503 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: user.email ?? undefined,
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
      invoice_creation: { enabled: true },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: pack.priceCents,
          product_data: {
            name: `${pack.credits} PMHNP job posts`,
            description: `Prepaid credits, about $${config.creditPackPerPostPrice(pack)} per post. Each credit publishes one ${config.durationDays} day featured listing. Credits expire ${config.creditPackValidDays} days after purchase.`,
          },
        },
      }],
      metadata: {
        type: 'credit_pack',
        packOptionId: pack.id,
        userId: user.id,
        quotaKeys: quotaKeys.join(','),
      },
      success_url: `${BASE_URL}/employer/dashboard?credits=purchased`,
      cancel_url: `${BASE_URL}/pricing?packs=cancelled`,
    });

    if (!session.url) {
      logger.error('Stripe returned a pack session with no URL', null, { sessionId: session.id });
      return NextResponse.json({ error: 'Could not start checkout.' }, { status: 502 });
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    logger.error('Failed to create credit pack checkout', err, { packId: pack.id, userId: user.id });
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 });
  }
}
