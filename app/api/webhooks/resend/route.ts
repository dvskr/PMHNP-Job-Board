import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { Webhook } from 'svix';

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || '';

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

    const eventType = payload.type;
    const emails = payload.data.to || [];
    const resendId = payload.data.email_id;

    // Handle engagement tracking events (update EmailSend status)
    if (['email.delivered', 'email.opened', 'email.clicked'].includes(eventType)) {
      if (resendId) {
        const statusMap: Record<string, string> = {
          'email.delivered': 'delivered',
          'email.opened': 'opened',
          'email.clicked': 'clicked',
        };
        await prisma.emailSend.updateMany({
          where: { resendId },
          data: { status: statusMap[eventType] },
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

      // Update EmailSend log status
      if (resendId) {
        await prisma.emailSend.updateMany({
          where: { resendId },
          data: { status: suppressionReason === 'bounce' ? 'bounced' : 'complained' },
        });
      }

      logger.info('Email suppressed via webhook', {
        email: normalizedEmail,
        reason: suppressionReason,
        resendId,
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
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
