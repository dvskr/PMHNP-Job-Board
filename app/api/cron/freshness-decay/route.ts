import { NextRequest, NextResponse } from 'next/server';
import { applyFreshnessDecay } from '@/lib/freshness-decay';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';

export const maxDuration = 120; // 2 minutes — updates quality scores for all jobs

export async function GET(request: NextRequest) {
  const authError = await verifyCronOrAdmin(request);
  if (authError) return authError;

  try {
    return await withCronTracking('freshness-decay', async () => {
      console.log('[CRON] Starting freshness decay process');
      const startTime = Date.now();

      const results = await applyFreshnessDecay();

      const { logSourceHealthCheck } = await import('@/lib/ingestion-monitor');
      await logSourceHealthCheck();

      const duration = Date.now() - startTime;
      const summary = {
        success: true,
        updated: results.updated,
        unpublished: results.unpublished,
        duration: `${(duration / 1000).toFixed(1)}s`,
        timestamp: new Date().toISOString(),
      };

      console.log('[CRON] Freshness decay complete:', summary);

      return {
        response: NextResponse.json(summary),
        metrics: {
          updated: results.updated,
          unpublished: results.unpublished,
          scoresRecomputed: results.scoresRecomputed,
          durationMs: duration,
        },
      };
    });
  } catch (error) {
    await sendCronFailureAlert('freshness-decay', error);
    console.error('[CRON] Freshness decay error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        success: false,
        error: 'Freshness decay failed',
        details: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

