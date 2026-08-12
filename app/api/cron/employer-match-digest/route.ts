import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';
import { runMatchDigestCron } from '@/lib/match-digest-service';

export const maxDuration = 120; // matching + per-employer sends

/**
 * GET /api/cron/employer-match-digest
 *
 * Daily employer match digests: vector-match visible candidates against
 * every live employer posting and email the employer up to 5 privacy-safe
 * candidate cards, plus the single 4-day follow-up for unclicked digests.
 *
 * SENDS BY DEFAULT. Stoppable without a deploy via OUTBOUND_MESSAGING_PAUSED=1.
 * With the flag unset the run exits before any matching compute. Pass
 * ?dryRun=1 to compute the full plan (matches, recipients, follow-ups) with
 * zero writes and zero sends — this works with the flag off and is the
 * operator's preview tool.
 *
 * Protected by CRON_SECRET (or an authenticated admin session).
 */
export async function GET(req: Request) {
    const authError = await verifyCronOrAdmin(req);
    if (authError) return authError;

    const dryRun = new URL(req.url).searchParams.get('dryRun') === '1';

    try {
        return await withCronTracking('employer-match-digest', async () => {
            const result = await runMatchDigestCron({ dryRun });
            return {
                response: NextResponse.json(result),
                metrics: {
                    enabled: result.enabled,
                    dryRun: result.dryRun,
                    postsConsidered: result.postsConsidered,
                    digestsSent: result.digestsSent,
                    followUpsSent: result.followUpsSent,
                    skippedCooldown: result.skippedCooldown,
                    skippedNoMatches: result.skippedNoMatches,
                    skippedSuppressed: result.skippedSuppressed,
                    skippedSharedCap: result.skippedSharedCap,
                    deferredToNextRun: result.deferredToNextRun,
                    errorCount: result.errors.length,
                },
            };
        });
    } catch (error) {
        await sendCronFailureAlert('employer-match-digest', error);
        logger.error('Employer match digest cron failed', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
