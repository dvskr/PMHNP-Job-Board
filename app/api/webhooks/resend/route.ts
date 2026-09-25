import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { Webhook } from 'svix';

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || '';

/**
 * Engagement funnel, weakest first. A status may only be overwritten by one
 * further along this ladder (plus the pre-delivery states lib/email-service.ts
 * writes when the send itself is logged), so out-of-order webhook delivery
 * cannot downgrade a recorded click. Bounce and complaint are handled
 * separately: they are terminal outcomes, not funnel stages.
 */
const ENGAGEMENT_LADDER = ['delivered', 'opened', 'clicked'] as const;

/** Statuses written before any webhook arrives (lib/email-service.ts). */
const PRE_DELIVERY_STATUSES = ['sent', 'failed'] as const;

const ENGAGEMENT_STATUS_BY_EVENT: Record<string, string | undefined> = {
  'email.delivered': 'delivered',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
};

/** Every status that `status` is allowed to replace. */
function statusesBelow(status: string): string[] {
  const rank = ENGAGEMENT_LADDER.indexOf(status as typeof ENGAGEMENT_LADDER[number]);
  return [...PRE_DELIVERY_STATUSES, ...ENGAGEMENT_LADDER.slice(0, rank)];
}

interface ResendWebhookPayload {
  type: string;
  data: {
    email_id: string;
    to: string[];
    from: string;
    subject: string;
    created_at: string;
  };
}

export async function POST(request: NextRequest) {
  if (!WEBHOOK_SECRET) {
    logger.error('RESEND_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  try {
    const body = await request.text();

    // Verify signature using Svix (Resend uses Svix for webhooks)
    const svixId = request.headers.get('svix-id') || '';
    const svixTimestamp = request.headers.get('svix-timestamp') || '';
    const svixSignature = request.headers.get('svix-signature') || '';

    const wh = new Webhook(WEBHOOK_SECRET);
    let payload: ResendWebhookPayload;

    try {
      payload = wh.verify(body, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as ResendWebhookPayload;
    } catch (e) {
      logger.error('Webhook signature verification failed', e);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // P5.A idempotency (2026-06-01): Svix re-delivers webhooks on
    // transient failures. Without dedupe, the bounce/complaint path
    // would re-suppress (idempotent at the row level but pollutes
    // audit timestamps) and the engagement tracking would overwrite
    // newer statuses with older ones (e.g. an "opened" replay AFTER
    // a "clicked" event downgrades the funnel). Reusing the
    // ProcessedStripeEvent table with a `resend:` prefix avoids a
    // schema migration for a sibling-events use case.
    const dedupeKey = `resend:${svixId}`;
    try {
      await prisma.processedStripeEvent.create({
        data: { eventId: dedupeKey, eventType: payload.type },
      });
    } catch (dedupeErr) {
      const code = (dedupeErr as { code?: string } | null)?.code;
      if (code === 'P2002') {
        logger.info('Resend webhook already processed; skipping', { svixId, type: payload.type });
        return NextResponse.json({ received: true, deduped: true });
      }
      logger.error('Failed to record processed Resend event', dedupeErr, { svixId });
      return NextResponse.json({ error: 'Idempotency check failed' }, { status: 500 });
    }

    const eventType = payload.type;
    const emails = payload.data.to || [];
    const resendId = payload.data.email_id;

    // Handle engagement tracking events (update EmailSend status).
    //
    // The dedupe row above only suppresses a replay of the SAME svix id.
    // Sibling events carry their own ids, so a 'delivered' retried after a
    // transient failure lands AFTER the 'clicked' it preceded, and an
    // unconditional write walked the funnel backwards: the click was recorded,
    // then erased. Status only moves forward along delivered to opened to
    // clicked, enforced in the WHERE clause so two concurrent deliveries cannot
    // race between a read and a write.
    if (ENGAGEMENT_STATUS_BY_EVENT[eventType]) {
      if (resendId) {
        const status = ENGAGEMENT_STATUS_BY_EVENT[eventType];
        await prisma.emailSend.updateMany({
          where: { resendId, status: { in: statusesBelow(status) } },
          data: { status },
        });
      }
      return NextResponse.json({ received: true, action: 'tracked', event: eventType });
    }

    // Only handle bounce and complaint events for suppression
    if (eventType !== 'email.bounced' && eventType !== 'email.complained') {
      return NextResponse.json({ received: true, action: 'ignored' });
    }

    const suppressionReason = eventType === 'email.bounced' ? 'bounce' : 'complaint';

    for (const email of emails) {
      const normalizedEmail = email.toLowerCase().trim();

      // Suppress in EmailLead
      await prisma.emailLead.updateMany({
        where: { email: normalizedEmail },
        data: {
          isSuppressed: true,
          suppressedAt: new Date(),
          suppressionReason,
          isSubscribed: false,
        },
      });

      // Suppress in UserProfile
      await prisma.userProfile.updateMany({
        where: { email: normalizedEmail },
        data: {
          emailSuppressed: true,
          emailSuppressedAt: new Date(),
        },
      });

      // Mark in ProgramDirectorLead so the PD campaign script skips
      // bounced/complained addresses on future touches. The send script
      // already filters by emailStatus='Valid' — flipping the status
      // here removes them from the eligible pool the next time it runs.
      if (suppressionReason === 'bounce') {
        await prisma.programDirectorLead.updateMany({
          where: { email: normalizedEmail },
          data: {
            outreachStatus: 'bounced',
            emailStatus: 'Bounced',
          },
        });
      } else {
        // complaint — treat as declined (PD effectively said "stop")
        await prisma.programDirectorLead.updateMany({
          where: { email: normalizedEmail },
          data: { outreachStatus: 'declined' },
        });
      }

      logger.info('Email suppressed via webhook', {
        email: normalizedEmail,
        reason: suppressionReason,
        resendId,
      });
    }

    // Update the EmailSend log status ONCE per webhook (not per recipient).
    // Resend sends one webhook per email send so this is keyed by resendId,
    // not by recipient — avoids redundant writes if a multi-recipient webhook ever ships.
    if (resendId) {
      await prisma.emailSend.updateMany({
        where: { resendId },
        data: { status: suppressionReason === 'bounce' ? 'bounced' : 'complained' },
      });
    }

    return NextResponse.json({
      received: true,
      action: 'suppressed',
      emails: emails.length,
      reason: suppressionReason,
    });
  } catch (error) {
    logger.error('Resend webhook error', error);
    // P5.A: roll back the dedupe row so Svix retry can replay. Mirrors
    // the Stripe webhook C2 pattern. svixId is captured at the top of
    // the outer try; if we never made it past dedupe insert, the
    // delete fails silently (which is fine — nothing to roll back).
    try {
      const svixIdForCleanup = request.headers.get('svix-id');
      if (svixIdForCleanup) {
        await prisma.processedStripeEvent.delete({
          where: { eventId: `resend:${svixIdForCleanup}` },
        }).catch(() => { /* ignore P2025 not-found */ });
      }
    } catch {
      // Best-effort cleanup; the outer 500 still surfaces the failure.
    }
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
