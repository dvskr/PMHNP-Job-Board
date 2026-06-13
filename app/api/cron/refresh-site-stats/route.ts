import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';
import { refreshSiteStats } from '@/lib/site-stats';

export const maxDuration = 60;

/**
 * Recomputes the cached site-wide counters (jobs / companies / subscribers)
 * into the SiteStat singleton row. The homepage reads from that row instead of
 * running the aggregate queries itself on every render. Runs hourly — the
 * numbers move slowly (jobs ingest in a few daily waves).
 */
export async function GET(request: NextRequest) {
    const authError = await verifyCronOrAdmin(request);
    if (authError) return authError;

    try {
        return await withCronTracking('refresh-site-stats', async () => {
            const stats = await refreshSiteStats();
            logger.info('refresh-site-stats complete', { ...stats });
            return {
                response: NextResponse.json({ success: true, ...stats }),
                metrics: { ...stats },
            };
        });
    } catch (err) {
        await sendCronFailureAlert('refresh-site-stats', err);
        logger.error('Cron refresh-site-stats error', err);
        return NextResponse.json({ error: 'refresh-site-stats failed' }, { status: 500 });
    }
}
