import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendCreditExpiryWarningEmail, isEmailSuppressed } from '@/lib/email-service';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';
import { logger } from '@/lib/logger';

export const maxDuration = 120;

/**
 * Warn buyers before their prepaid posting credits expire.
 *
 * WHY THIS EXISTS. getCreditBalance has always computed `nextExpiry`, and it
 * already reaches the dashboard, but nothing read it on a schedule. A buyer
 * who bought a ten pack and used six simply lost the other four on day 365,
 * having paid for them, with no notice at any point. That is the worst
 * failure mode this feature has: it is silent, it is the customer's money,
 * and they only find out by not finding out.
 *
 * WHEN IT FIRES. Once per pack, WARNING_DAYS_BEFORE ahead of expiry. Not a
 * sequence: one honest heads-up while there is still time to use the
 * credits. A pack with nothing left on it is never mailed, because there is
 * nothing to lose.
 *
 * EXACTLY ONCE. Same two-phase discipline as the posting expiry sweep in
 * app/api/cron/expiry-warnings, and for the same reason: a pack sits inside
 * the warning window for days, so without a claim this would mail every
 * morning until the pack died.
 *
 *   PHASE 1, claim: one `updateMany` whose WHERE touches only scalar columns
 *     of the row it writes (`id`, plus `expiryWarningSentAt IS NULL`).
 *     Postgres row locking makes the second of two concurrent runs match
 *     zero rows, so count === 0 means walk away without sending.
 *   PHASE 2, send. On a definitive rejection the claim is handed back,
 *     guarded on our own stamp, so a later run retries. On an ambiguous
 *     failure the claim is KEPT: one missed warning beats telling somebody
 *     twice that their credits are dying.
 *
 * ?dryRun=1 reports exactly who would be mailed and writes nothing.
 */

/** How far ahead of expiry the warning goes out. */
const WARNING_DAYS_BEFORE = 14;

interface WarningPreview {
  packId: string;
  to: string;
  creditsRemaining: number;
  expiresAt: string;
}

export async function GET(request: NextRequest) {
  const authError = await verifyCronOrAdmin(request);
  if (authError) return authError;

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  try {
    return await withCronTracking('credit-expiry-warnings', async () => {
      const now = new Date();
      const horizon = new Date(now.getTime() + WARNING_DAYS_BEFORE * 86_400_000);

      const candidates = await prisma.postingCreditPack.findMany({
        where: {
          expiryWarningSentAt: null,
          // A refunded or disputed pack is not the buyer's to spend, so
          // there is nothing for them to lose and nothing to warn about.
          refundedAt: null,
          disputedAt: null,
          // Inside the window and not already dead. A pack that expired
          // before anyone noticed cannot be rescued by an email.
          expiresAt: { gt: now, lte: horizon },
        },
        select: {
          id: true, userId: true, creditsTotal: true, creditsUsed: true, expiresAt: true,
        },
        // Soonest to die first: if this run ever times out, the packs with
        // the least time left should not be the ones left unmailed.
        orderBy: { expiresAt: 'asc' },
      });

      // Buyer identity is on UserProfile, looked up in one query rather than
      // per pack.
      const buyers = candidates.length
        ? await prisma.userProfile.findMany({
            where: { supabaseId: { in: [...new Set(candidates.map((c) => c.userId))] } },
            select: { supabaseId: true, email: true, firstName: true },
          })
        : [];
      const buyerById = new Map(buyers.map((b) => [b.supabaseId, b]));

      let sent = 0;
      let skippedNoCredits = 0;
      let skippedNoBuyer = 0;
      let skippedSuppressed = 0;
      let skippedClaimLost = 0;
      const errors: string[] = [];
      const previews: WarningPreview[] = [];

      for (const pack of candidates) {
        const creditsRemaining = pack.creditsTotal - pack.creditsUsed;
        if (creditsRemaining <= 0) {
          // Fully spent. Nothing is being forfeited, so this is not news.
          skippedNoCredits++;
          continue;
        }

        const buyer = buyerById.get(pack.userId);
        if (!buyer?.email) {
          skippedNoBuyer++;
          continue;
        }

        const daysLeft = Math.max(
          1,
          Math.ceil((pack.expiresAt.getTime() - now.getTime()) / 86_400_000),
        );

        if (dryRun) {
          previews.push({
            packId: pack.id,
            to: buyer.email,
            creditsRemaining,
            expiresAt: pack.expiresAt.toISOString(),
          });
          continue;
        }

        // Hard-bounced or complained: skip WITHOUT stamping, so the row is
        // reconsidered if the address is ever un-suppressed.
        if (await isEmailSuppressed(buyer.email)) {
          skippedSuppressed++;
          continue;
        }

        try {
          // ── PHASE 1: CLAIM ──
          const claimed = await prisma.postingCreditPack.updateMany({
            where: { id: pack.id, expiryWarningSentAt: null },
            data: { expiryWarningSentAt: now },
          });
          if (claimed.count === 0) {
            skippedClaimLost++;
            continue;
          }

          // ── PHASE 2: SEND ──
          const result = await sendCreditExpiryWarningEmail({
            email: buyer.email,
            contactName: buyer.firstName,
            creditsRemaining,
            expiresAt: pack.expiresAt,
            daysLeft,
          });

          if (result.success) {
            sent++;
            continue;
          }

          if (result.rejected) {
            // Definitively not sent, so handing the claim back is provably
            // safe. Guarded on our own stamp so a concurrent writer is never
            // clobbered.
            await prisma.postingCreditPack.updateMany({
              where: { id: pack.id, expiryWarningSentAt: now },
              data: { expiryWarningSentAt: null },
            });
            errors.push(`Pack ${pack.id}: rejected: ${result.error}`);
          } else {
            // May already have reached the provider. Keep the claim.
            errors.push(`Pack ${pack.id}: ambiguous failure, claim kept: ${result.error}`);
            logger.error('Credit expiry warning ambiguous failure; claim kept', result.error, {
              packId: pack.id,
            });
          }
        } catch (e) {
          errors.push(`Pack ${pack.id}: ${e}`);
          logger.error('Credit expiry warning failed before or during claim', e, { packId: pack.id });
        }
      }

      if (dryRun) {
        return {
          response: NextResponse.json({
            success: true,
            dryRun: true,
            windowDays: WARNING_DAYS_BEFORE,
            candidates: candidates.length,
            wouldSend: previews,
            skippedNoCredits,
            skippedNoBuyer,
            timestamp: now.toISOString(),
          }),
          metrics: {
            dryRun: true,
            candidates: candidates.length,
            wouldSend: previews.length,
            skippedNoCredits,
            skippedNoBuyer,
          },
        };
      }

      return {
        response: NextResponse.json({
          success: true,
          sent,
          skippedNoCredits,
          skippedNoBuyer,
          skippedSuppressed,
          skippedClaimLost,
          errors,
          timestamp: now.toISOString(),
        }),
        metrics: {
          candidates: candidates.length,
          sent,
          skippedNoCredits,
          skippedNoBuyer,
          skippedSuppressed,
          skippedClaimLost,
          errors: errors.length,
        },
      };
    });
  } catch (error) {
    await sendCronFailureAlert('credit-expiry-warnings', error);
    logger.error('Cron credit-expiry-warnings error', error);
    return NextResponse.json({ error: 'Credit expiry warnings failed' }, { status: 500 });
  }
}
