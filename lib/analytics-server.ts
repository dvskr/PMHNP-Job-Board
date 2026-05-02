/**
 * Server-side analytics — GA4 Measurement Protocol.
 *
 * Used by the Stripe webhook to fire `purchase` events when payment is
 * confirmed (the only place we authoritatively know payment completed).
 * Fire-and-forget; never blocks or fails the webhook flow.
 *
 * Configure with:
 *   GA_MEASUREMENT_ID         — e.g. G-XXXXXXXXXX  (NOT the public _NEXT one — server-side)
 *   GA_API_SECRET             — generated in GA4 Admin → Data Streams → Measurement Protocol API secrets
 *
 * Without both env vars, all calls below silently no-op.
 */

import { logger } from '@/lib/logger';

const MP_ENDPOINT = 'https://www.google-analytics.com/mp/collect';

interface PurchaseParams {
  /** A stable id for the buyer — Stripe customer id, employer id, or session id */
  clientId: string;
  /** Stripe checkout session id, used as transaction_id (idempotent w/ #3) */
  sessionId: string;
  /** Total amount paid */
  amountCents: number;
  currency: string;
  /** 'new' job post or 'renewal' */
  type: 'new' | 'renewal';
  /** Optional: pricing tier carried in metadata */
  tier?: string;
  /** Optional: jobId for funnel attribution */
  jobId?: string;
}

export async function trackServerPurchase(params: PurchaseParams): Promise<void> {
  const measurementId = process.env.GA_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const apiSecret = process.env.GA_API_SECRET;

  if (!measurementId || !apiSecret) {
    // Silent no-op when not configured. Don't log every webhook hit.
    return;
  }

  const url = `${MP_ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;

  const body = {
    client_id: params.clientId,
    events: [
      {
        name: 'purchase',
        params: {
          transaction_id: params.sessionId,
          currency: params.currency.toUpperCase(),
          value: params.amountCents / 100,
          checkout_type: params.type,
          ...(params.tier ? { pricing_tier: params.tier } : {}),
          ...(params.jobId ? { job_id: params.jobId } : {}),
          items: [
            {
              item_id: params.jobId ?? 'job-post',
              item_name: params.type === 'renewal' ? 'Job Posting Renewal' : 'Job Posting',
              item_category: params.type,
              price: params.amountCents / 100,
              quantity: 1,
            },
          ],
        },
      },
    ],
  };

  try {
    // 5s timeout — never block the webhook
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    // Best-effort — log and move on. Never fail the webhook because of analytics.
    logger.warn('GA4 Measurement Protocol purchase event failed', { err: String(err), sessionId: params.sessionId });
  }
}
