import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { config, PostPriceKind } from '@/lib/config';
import { logger } from '@/lib/logger';
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

/**
 * Neutral shape: no discount claimed. Used for a caller who cannot post, and
 * for a lookup that failed, where claiming a discount we cannot verify is the
 * one answer that costs the employer something.
 */
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
  } catch (error) {
    // FAIL NEUTRAL, NOT TOWARD THE DISCOUNT. create-checkout charges the
    // discount when its own lookup fails, and that is correct there because
    // the same request both decides and bills. Here the quote and the charge
    // are two separate requests: a preview that says "half price" does not
    // make create-checkout charge half price, it just sets the employer up to
    // be billed the standard price after being promised the discount and the
    // refund guarantee that rides with it.
    //
    // Every caller guards on res.ok alone and none of them reads `reason`, so
    // a 500 is what actually moves the funnel to neutral price copy. A 200
    // with a discount in it is indistinguishable from a real quote.
    logger.error('post-price lookup failed; declining to quote a price', error);
    return NextResponse.json(ineligible('server-error'), { status: 500 });
  }
}
