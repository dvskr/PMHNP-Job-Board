import { NextRequest, NextResponse } from 'next/server';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { withCronTracking } from '@/lib/cron/track';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { logger } from '@/lib/logger';
import { isSystemMessagesEnabled, runSystemMessages } from '@/lib/system-messages';
import { OUTBOUND_PAUSED_MESSAGE } from '@/lib/outbound-kill-switch';

export const maxDuration = 120; // 2 minutes: DB writes plus optional employer email piggybacks

/**
 * GET /api/cron/system-messages
 *
 * Weekly-cadence in-platform nudges from the 'PMHNP Hiring Team' system
 * profile (lib/system-messages.ts): employers hear about new applications on
 * their live posts, candidates get up to 3 picked jobs. Rides the existing
 * Conversation + EmployerMessage models, so everything lands in /messages.
 *
 * OPERATOR GATE: in-platform messages send BY DEFAULT. There is no per-feature
 * enable flag; isSystemMessagesEnabled() is the shared emergency brake
 * (lib/outbound-kill-switch), so the only thing that stops a real run is
 * OUTBOUND_MESSAGING_PAUSED=1. The brake is checked again inside
 * sendSystemMessage, so this route is not the only thing standing between
 * "paused" and a bulk send. ?dryRun=1 still works while paused (counts +
 * previews, zero writes) so the operator can inspect what WOULD go out.
 *
 * This docblock and the skip reason below both used to name a per-feature
 * enable flag that no code anywhere reads. An operator hitting the skip
 * response would set that variable, see no change, and believe these nudges
 * were off while they were messaging users. The static test in
 * tests/regressions/system-messages-static.test.ts now refuses the old name.
 *
 * Query params:
 *   ?dryRun=1                  preview only, no writes (works while paused)
 *   ?side=employer|candidate   restrict to one side (default: both)
 *
 * Protected by CRON_SECRET (or an admin session via /admin/cron).
 */
export async function GET(req: NextRequest) {
    const authError = await verifyCronOrAdmin(req);
    if (authError) return authError;

    const { searchParams } = new URL(req.url);
    const dryRun = searchParams.get('dryRun') === '1';
    const sideParam = searchParams.get('side');
    const side = sideParam === 'employer' || sideParam === 'candidate' ? sideParam : undefined;

    if (!isSystemMessagesEnabled() && !dryRun) {
        return NextResponse.json({
            skipped: true,
            enabled: false,
            reason: OUTBOUND_PAUSED_MESSAGE,
        });
    }

    try {
        return await withCronTracking('system-messages', async () => {
            const summary = await runSystemMessages({ dryRun, side });
            return {
                response: NextResponse.json({ success: true, ...summary }),
                metrics: {
                    dryRun,
                    side: side ?? 'both',
                    employerConsidered: summary.employer.considered,
                    employerSent: summary.employer.sent,
                    employerCapped: summary.employer.capped,
                    candidateConsidered: summary.candidate.considered,
                    candidateSent: summary.candidate.sent,
                    candidateCapped: summary.candidate.capped,
                },
            };
        });
    } catch (error) {
        await sendCronFailureAlert('system-messages', error);
        logger.error('System messages cron failed', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
