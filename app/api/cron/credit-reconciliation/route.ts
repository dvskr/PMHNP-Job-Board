import { NextRequest, NextResponse } from 'next/server';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert, sendDiscordMessage } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';
import { logger } from '@/lib/logger';
import { findCreditDrift, QUIET_PERIOD_MINUTES } from '@/lib/credit-reconciliation';

export const maxDuration = 60;

/**
 * Nightly check that every spent posting credit has a posting behind it.
 *
 * Spending a credit and creating the posting it paid for are two statements
 * with a compensator in between, and the compensator only runs if the
 * process survives to reach it. A kill in that window leaves the employer
 * one post short, and nothing else in the system would ever notice.
 *
 * READ ONLY, DELIBERATELY. See lib/credit-reconciliation.ts: drift is
 * inferred from EmployerJob rows that the admin routes can hard delete, so
 * an automatic restore would mint a credit every time an admin removed a
 * credit funded posting. Whether a deleted posting should cost the employer
 * a credit is a human question. This raises the flag;
 * scripts/reconcile-credit-drift.ts restores a named pack afterwards.
 *
 * Silent when there is nothing to report, which is the normal case. It only
 * ever speaks up to say something is wrong.
 */
export async function GET(request: NextRequest) {
  const authError = await verifyCronOrAdmin(request);
  if (authError) return authError;

  try {
    return await withCronTracking('credit-reconciliation', async () => {
      const report = await findCreditDrift();

      // An over-delivery cannot be produced by the spend window: it means
      // more postings exist than credits were taken for, which is somebody
      // posting free. Louder than a shortfall, and first in the message.
      if (report.overDeliveries.length > 0) {
        logger.error('Credit packs delivered more postings than were spent', null, {
          packs: report.overDeliveries.map((d) => ({
            packId: d.packId, creditsUsed: d.creditsUsed, postingsFound: d.postingsFound,
          })),
        });
      }

      if (report.shortfalls.length > 0) {
        logger.warn('Credit packs are short postings against their counters', {
          creditsOwed: report.creditsOwed,
          packs: report.shortfalls.map((d) => ({
            packId: d.packId, drift: d.drift, creditsUsed: d.creditsUsed,
          })),
        });
      }

      if (report.overDeliveries.length > 0 || report.shortfalls.length > 0) {
        // Pack ids only. No employer names, no email addresses: this goes to
        // a chat channel.
        const lines = [
          '**Credit pack reconciliation**',
          report.overDeliveries.length > 0
            ? `FREE POSTS: ${report.overDeliveries.length} pack(s) delivered more postings than credits spent: ${report.overDeliveries.map((d) => `${d.packId} (+${-d.drift})`).join(', ')}`
            : null,
          report.shortfalls.length > 0
            ? `Owed: ${report.creditsOwed} credit(s) across ${report.shortfalls.length} pack(s): ${report.shortfalls.map((d) => `${d.packId} (${d.drift})`).join(', ')}`
            : null,
          'Review, then restore with: npx tsx scripts/reconcile-credit-drift.ts --apply --pack <id>',
        ].filter(Boolean) as string[];

        await sendDiscordMessage(lines.join('\n')).catch(() => {
          /* logged inside; a failed alert must not fail the sweep */
        });
      }

      return {
        response: NextResponse.json({
          success: true,
          quietPeriodMinutes: QUIET_PERIOD_MINUTES,
          ...report,
        }),
        metrics: {
          packsChecked: report.packsChecked,
          shortfalls: report.shortfalls.length,
          overDeliveries: report.overDeliveries.length,
          creditsOwed: report.creditsOwed,
        },
      };
    });
  } catch (error) {
    await sendCronFailureAlert('credit-reconciliation', error);
    logger.error('Cron credit-reconciliation error', error);
    return NextResponse.json({ error: 'Credit reconciliation failed' }, { status: 500 });
  }
}
