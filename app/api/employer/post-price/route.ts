import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { config, PostPriceKind } from '@/lib/config';
import { buildQuotaKeys, domainFromEmail } from '@/lib/employer-quota';

/**
 * GET /api/employer/post-price
 *
 * Read-only price preview for the post-job funnel, so the UI can say "$149,
 * half price" or "$299" before the employer commits to the form. It must
 * agree with /api/create-checkout, which is the route that actually charges:
 * same keys, same predicate, same 'pending'-excluded filter. When those two
 * drift the employer is quoted one price and billed another.
 *
 * `eligible` means MAY POST, which is now essentially always true for a
 * signed-in employer. It is not a pricing signal: the old endpoint refused
 * consumer signup domains outright, which only ever made sense while the
 * first post was a giveaway worth protecting. A solo practitioner on a
 * consumer mailbox pays like everyone else, so nothing refuses them.
 *
 * `isFirstPost` is the discount signal, and a false value never blocks
 * anything. It just means this employer identity has already spent its
 * half-price entry.
 */
/** Renewals are priced by /api/create-renewal-checkout, never quoted here. */
type NewPostPriceKind = Exclude<PostPriceKind, 'renewal'>;

interface PostPriceResponse {
  eligible: boolean;
  isFirstPost: boolean;
  priceKind: NewPostPriceKind;
  priceDollars: number;
  remaining: number;
  reason?: string;
}

/** Shape for a caller who cannot post: quote the standard price, no discount. */
function ineligible(reason: string): PostPriceResponse {
  return {
    eligible: false,
    isFirstPost: false,
    priceKind: 'standard',
    priceDollars: config.priceFor('standard'),
    remaining: 0,
    reason,
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json(ineligible('unauthenticated'));
    }

    const profile = await prisma.userProfile.findUnique({
      where: { supabaseId: user.id },
      select: { role: true, company: true },
    });

    if (!profile || profile.role !== 'employer') {
      return NextResponse.json(ineligible('not-employer'));
    }

    // domainFromEmail, NOT rawDomainFromEmail: it must be the exact helper
    // /api/create-checkout uses, or the quote and the charge disagree. The
    // difference is consumer mailboxes, which this nulls out. That is
    // deliberate on both sides: gmail.com is shared infrastructure, so
    // matching a legacy quotaDomain row on it would spend one stranger's
    // discount on another. Consumer-domain posters are gated per-account by
    // the acct: key instead, exactly as buildQuotaKeys intends.
    const signupDomain = domainFromEmail(user.email);
    const quotaKeys = buildQuotaKeys({
      userId: user.id,
      signupEmail: user.email,
      lockedCompanyName: profile.company?.trim() || null,
    });

    const used = await prisma.employerJob.count({
      where: {
        // Abandoned checkouts are not postings and must not spend the
        // discount. Mirrors /api/create-checkout exactly.
        paymentStatus: { not: 'pending' },
        OR: [
          { quotaKeys: { hasSome: quotaKeys } },
          ...(signupDomain ? [{ quotaDomain: signupDomain }] : []),
        ],
      },
    });

    const remaining = Math.max(0, config.discountedPostsPerEmployer - used);
    const isFirstPost = remaining > 0;
    const priceKind: NewPostPriceKind = isFirstPost ? 'first' : 'standard';

    const response: PostPriceResponse = {
      eligible: true,
      isFirstPost,
      priceKind,
      priceDollars: config.priceFor(priceKind),
      remaining,
    };
    return NextResponse.json(response);
  } catch {
    // Quote the DISCOUNT on failure, for the same reason create-checkout
    // charges it on failure: a quote that undersells is recoverable, a quote
    // that oversells the promised half-price post is a broken promise.
    const response: PostPriceResponse = {
      eligible: true,
      isFirstPost: true,
      priceKind: 'first',
      priceDollars: config.priceFor('first'),
      remaining: config.discountedPostsPerEmployer,
      reason: 'server-error',
    };
    return NextResponse.json(response, { status: 200 });
  }
}
