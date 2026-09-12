import { NextResponse } from 'next/server';

/**
 * RETIRED. The board no longer has an unpaid posting path: every job post
 * goes through /api/create-checkout, at the half-price first-post rate or the
 * standard rate.
 *
 * The route stays as a 410 rather than a 404 so a stale client bundle, a
 * bookmarked integration, or a queued retry gets an answer that says the
 * endpoint is gone on purpose instead of looking like a routing bug. The free
 * quota gate that used to live here (the Serializable transaction, the
 * FreeQuotaExceededError, the consumer-domain refusal) is deleted with it; the
 * quota KEYS it was built on live on in lib/employer-quota.ts and now decide
 * the first-post discount inside /api/create-checkout.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'Free job posting has been retired',
      message: 'All job posts now go through checkout. Please submit your listing from the post a job page.',
      code: 'FREE_POSTING_RETIRED',
    },
    { status: 410 }
  );
}
