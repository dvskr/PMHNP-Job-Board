import { NextRequest, NextResponse } from 'next/server';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { withCronTracking } from '@/lib/cron/track';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { logger } from '@/lib/logger';
import { isSystemMessagesEnabled, runSystemMessages } from '@/lib/system-messages';

export const maxDuration = 120; // 2 minutes: DB writes plus optional employer email piggybacks

/**
 * GET /api/cron/system-messages
 *
 * Weekly-cadence in-platform nudges from the 'PMHNP Hiring Team' system
 * profile (lib/system-messages.ts): employers hear about new applications on
 * their live posts, candidates get up to 3 picked jobs. Rides the existing
 * Conversation + EmployerMessage models, so everything lands in /messages.
 *
 * OPERATOR GATE: real sends require ENABLE_SYSTEM_MESSAGES=1 (default off).
 * Without the flag the route only runs in ?dryRun=1 mode (counts + previews,
 * zero writes) so the operator can inspect exactly what WOULD go out before
 * enabling. The flag is enforced again inside sendSystemMessage, so this
 * route cannot be the only thing standing between "off" and a bulk send.
 *
 * Query params:
 *   ?dryRun=1                  preview only, no writes (works without the flag)
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
            reason: 'ENABLE_SYSTEM_MESSAGES is not enabled',
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
