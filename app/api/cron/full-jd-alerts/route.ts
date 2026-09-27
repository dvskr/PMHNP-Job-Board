import { NextRequest, NextResponse } from 'next/server';
import { sendFullJdAlerts } from '@/lib/full-jd-alert-service';
import { logger } from '@/lib/logger';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';
import { isOutboundPaused, OUTBOUND_PAUSED_MESSAGE } from '@/lib/outbound-kill-switch';

// 5 minutes, matching the other bulk senders. This one sends per recipient
// rather than through Resend's batch API, because each message carries a
// different job and the ledger claim has to settle per message, so it is
// slower per thousand than the digest.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authError = await verifyCronOrAdmin(request);
  if (authError) return authError;

  if (isOutboundPaused()) {
    return NextResponse.json({ enabled: false, message: OUTBOUND_PAUSED_MESSAGE });
  }

  try {
    return await withCronTracking('full-jd-alerts', async () => {
      const results = await sendFullJdAlerts();
      logger.info('Full JD alerts complete', { ...results });

      return {
        response: NextResponse.json({
          success: true,
          ...results,
          timestamp: new Date().toISOString(),
        }),
        metrics: {
          sent: results.sent,
          considered: results.considered,
          noMatch: results.noMatch,
          suppressed: results.suppressed,
          errors: results.errors,
        },
      };
    });
  } catch (error) {
    await sendCronFailureAlert('full-jd-alerts', error);
    logger.error('Cron full-jd-alerts error', error);
    return NextResponse.json({ error: 'Full JD alert sending failed' }, { status: 500 });
  }
}
