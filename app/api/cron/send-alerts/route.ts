import { NextRequest, NextResponse } from 'next/server'
import { sendJobAlerts } from '@/lib/job-alerts-service'
import { logger } from '@/lib/logger'
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';
import { isOutboundPaused, OUTBOUND_PAUSED_MESSAGE } from '@/lib/outbound-kill-switch';

export const maxDuration = 60

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authError = await verifyCronOrAdmin(request);
  if (authError) return authError;

  // Emergency brake. Job alert digests go out through Resend's batch API, not
  // through sendAndLog, so this cron needs its own check: without it the brake
  // would leave the single highest-volume automated sender running.
  if (isOutboundPaused()) {
    return NextResponse.json({ enabled: false, message: OUTBOUND_PAUSED_MESSAGE });
  }

  try {
    return await withCronTracking('send-alerts', async () => {
      // Use the job alerts service (GAP FIX 2)
      const results = await sendJobAlerts()

      logger.info('Job alerts complete', results)

      return {
        response: NextResponse.json({
          success: true,
          alertsSent: results.sent,
          alertsSkipped: results.skipped,
          errors: results.errors,
          timestamp: new Date().toISOString(),
        }),
        metrics: {
          alertsSent: results.sent,
          alertsSkipped: results.skipped,
          errors: results.errors,
        },
      };
    });
  } catch (error) {
      await sendCronFailureAlert('send-alerts', error);
    logger.error('Cron send-alerts error', error)
    return NextResponse.json({ error: 'Alert sending failed' }, { status: 500 })
  }
}
