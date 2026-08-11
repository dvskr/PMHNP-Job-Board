import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';
import {
  sendAndLog,
  isMarketingOptedOut,
  getOrCreateUnsubToken,
} from '@/lib/email-service';
import {
  LIFECYCLE_EMAILS,
  MAX_SENDS_PER_RUN,
  SHARED_MARKETING_CAP_DAYS,
  SHARED_MARKETING_CAP_EMAIL_TYPES,
  DAY_MS,
  isSendable,
  type LifecycleEmailDef,
  type LifecycleTarget,
} from '@/lib/lifecycle-emails';

export const maxDuration = 300; // 5 minutes — eligibility scans + batched sends

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com').replace(/\/$/, '');

interface PlannedSend {
  def: LifecycleEmailDef;
  target: LifecycleTarget;
}

/**
 * GET /api/cron/lifecycle-emails
 *
 * Daily product/lifecycle email fan-out for both audiences. HARD RULES:
 *   - Real sends require ENABLE_LIFECYCLE_EMAILS=1 (default OFF — the
 *     operator tests via /api/admin/lifecycle-test first, then enables).
 *   - ?dryRun=1 computes the exact would-send list without sending or
 *     writing claims, and works while the flag is off.
 *   - One email max per user per run; an emailId never repeats per user
 *     (LifecycleEmailSend @@unique); shared 7-day cap across all
 *     connect-feature email types; suppression respected.
 *
 * Protected by CRON_SECRET (or an admin session for manual triggers).
 */
export async function GET(req: Request) {
  const authError = await verifyCronOrAdmin(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dryRun') === '1';
  const sendingEnabled = process.env.ENABLE_LIFECYCLE_EMAILS === '1';

  // Flag off + not a dry run: do nothing (and do no eligibility work) so the
  // registered cron is inert until the operator explicitly enables sends.
  if (!sendingEnabled && !dryRun) {
    return NextResponse.json({
      enabled: false,
      message: 'ENABLE_LIFECYCLE_EMAILS is not set. Use ?dryRun=1 to preview eligibility without sending.',
    });
  }

  try {
    return await withCronTracking('lifecycle-emails', async () => {
      const now = new Date();
      const capCutoff = new Date(now.getTime() - SHARED_MARKETING_CAP_DAYS * DAY_MS);

      const planned: PlannedSend[] = [];
      const selectedUserIds = new Set<string>();
      const skippedByReason: Record<string, number> = {};
      let eligibleTotal = 0;

      for (const def of LIFECYCLE_EMAILS) {
        const targets = await def.findEligible(now);
        eligibleTotal += targets.length;
        if (targets.length === 0) continue;

        const userIds = targets.map((t) => t.userId);
        const emails = targets.map((t) => t.email);

        const [lifecycleRows, recentMarketingRows, suppressedLeads] = await Promise.all([
          // Both gates in one fetch: "ever sent this emailId" + "any
          // lifecycle send within the cap window".
          prisma.lifecycleEmailSend.findMany({
            where: { userId: { in: userIds } },
            select: { userId: true, emailId: true, sentAt: true },
          }),
          // Shared cap across ALL connect-feature email types. Admin test
          // sends are excluded by their '[TEST]' subject prefix.
          prisma.emailSend.findMany({
            where: {
              to: { in: emails },
              createdAt: { gte: capCutoff },
              emailType: { in: [...SHARED_MARKETING_CAP_EMAIL_TYPES] },
              NOT: { subject: { startsWith: '[TEST]' } },
            },
            select: { to: true },
          }),
          // Opt-out, not just hard suppression: the visible Unsubscribe
          // control on /email-preferences sets isSubscribed=false and leaves
          // isSuppressed alone, and lifecycle mail is exactly the kind of
          // marketing that unsubscribe is meant to stop.
          prisma.emailLead.findMany({
            where: {
              email: { in: emails },
              OR: [{ isSuppressed: true }, { isSubscribed: false }],
            },
            select: { email: true },
          }),
        ]);

        const sentIdsByUser = new Map<string, Set<string>>();
        const lastLifecycleByUser = new Map<string, Date>();
        for (const row of lifecycleRows) {
          const set = sentIdsByUser.get(row.userId) ?? new Set<string>();
          set.add(row.emailId);
          sentIdsByUser.set(row.userId, set);
          const prev = lastLifecycleByUser.get(row.userId);
          if (!prev || row.sentAt > prev) lastLifecycleByUser.set(row.userId, row.sentAt);
        }
        const recentlyMarketed = new Set(recentMarketingRows.map((r) => r.to));
        const suppressed = new Set(suppressedLeads.map((l) => l.email));

        for (const target of targets) {
          const verdict = isSendable({
            emailId: def.id,
            alreadySentEmailIds: sentIdsByUser.get(target.userId) ?? new Set<string>(),
            lastLifecycleSentAt: lastLifecycleByUser.get(target.userId) ?? null,
            recentSharedMarketingSend: recentlyMarketed.has(target.email),
            suppressed: suppressed.has(target.email),
            alreadySelectedThisRun: selectedUserIds.has(target.userId),
            now,
          });
          if (!verdict.ok) {
            const reason = verdict.reason ?? 'unknown';
            skippedByReason[reason] = (skippedByReason[reason] ?? 0) + 1;
            continue;
          }
          planned.push({ def, target });
          selectedUserIds.add(target.userId);
        }
      }

      const capped = planned.slice(0, MAX_SENDS_PER_RUN);
      const deferred = planned.length - capped.length;

      if (dryRun) {
        return {
          response: NextResponse.json({
            dryRun: true,
            sendingEnabled,
            eligible: eligibleTotal,
            wouldSend: capped.map((p) => ({
              emailId: p.def.id,
              audience: p.def.audience,
              userId: p.target.userId,
              email: p.target.email,
              subject: p.def.subject(p.target.ctx),
            })),
            deferredBeyondRunCap: deferred,
            skippedByReason,
          }),
          metrics: {
            dryRun: true,
            eligible: eligibleTotal,
            wouldSend: capped.length,
            deferred,
            ...skippedByReason,
          },
        };
      }

      let sent = 0;
      let claimConflicts = 0;
      let suppressedLastMinute = 0;
      let errors = 0;
      const sentByEmailId: Record<string, number> = {};

      for (const p of capped) {
        const { def, target } = p;

        // Freshness re-check right before the claim — the batch suppression
        // snapshot above can be minutes old by the tail of the loop.
        if (await isMarketingOptedOut(target.email)) {
          suppressedLastMinute++;
          continue;
        }

        // Everything that can fail WITHOUT touching Resend happens before the
        // claim, so the try around the send below has exactly one meaning.
        let unsubToken: string;
        let subject: string;
        let html: string;
        try {
          unsubToken = await getOrCreateUnsubToken(target.email);
          subject = def.subject(target.ctx);
          html = def.buildHtml(target.ctx);
        } catch (err) {
          errors++;
          logger.error('Lifecycle email render failed', err, {
            emailId: def.id,
            userId: target.userId,
          });
          continue;
        }

        // Claim-first (job-alerts discipline): the unique (userId, emailId)
        // row is created BEFORE the send. A concurrent run's duplicate
        // create throws P2002 → skip. A crash between claim and send can
        // only mean a missed email, never a duplicate.
        let claimId: string;
        try {
          const claim = await prisma.lifecycleEmailSend.create({
            data: { userId: target.userId, emailId: def.id },
            select: { id: true },
          });
          claimId = claim.id;
        } catch (err) {
          // ONLY a unique-constraint violation is a benign dedupe conflict.
          // Anything else (FK violation, connection loss) is a real fault and
          // must not hide behind the conflict counter — the operator reads
          // these numbers to decide whether enablement is safe.
          const code = (err as { code?: string })?.code;
          if (code === 'P2002') {
            claimConflicts++;
          } else {
            errors++;
            logger.error('Lifecycle claim write failed', err, {
              emailId: def.id,
              userId: target.userId,
            });
          }
          continue;
        }

        try {
          const sendResult = await sendAndLog(
            {
              from: '', // overridden by sendAndLog ('lifecycle' is in MARKETING_EMAIL_TYPES)
              to: target.email,
              subject,
              html,
            },
            'lifecycle',
            { lifecycleEmailId: def.id, audience: def.audience },
            `${BASE_URL}/unsubscribe?token=${unsubToken}`,
          );
          // sendAndLog returns Resend's { data, error } envelope and only
          // THROWS on a transport-level fault. An API-level rejection (bad
          // address, domain block) comes back as `error` with nothing sent, so
          // without this branch the run would count it as sent and leave the
          // claim in place — and because (userId, emailId) is unique and never
          // repeats, that user could never receive this email again.
          if (sendResult?.error) {
            errors++;
            logger.error('Lifecycle email rejected by provider', sendResult.error, {
              emailId: def.id,
              userId: target.userId,
            });
            await prisma.lifecycleEmailSend
              .delete({ where: { id: claimId } })
              .catch((revertErr) => {
                logger.error('Failed to revert lifecycle claim', revertErr, { claimId });
              });
            continue;
          }
          sent++;
          sentByEmailId[def.id] = (sentByEmailId[def.id] ?? 0) + 1;
        } catch (err) {
          // AMBIGUOUS: a throw here means the request may already have reached
          // Resend (socket timeout, aborted response). Keep the claim and fail
          // closed — a missed lifecycle email is recoverable by hand, a
          // duplicate is not. Definitive rejections are handled above, where
          // reverting is provably safe.
          errors++;
          logger.error('Lifecycle email send failed mid-flight; claim kept', err, {
            emailId: def.id,
            userId: target.userId,
            claimId,
          });
        }
      }

      logger.info('Lifecycle email cron complete', {
        eligible: eligibleTotal,
        planned: capped.length,
        sent,
        claimConflicts,
        suppressedLastMinute,
        errors,
      });

      return {
        response: NextResponse.json({
          sendingEnabled,
          eligible: eligibleTotal,
          planned: capped.length,
          sent,
          sentByEmailId,
          claimConflicts,
          suppressedLastMinute,
          deferredBeyondRunCap: deferred,
          skippedByReason,
          errors,
        }),
        metrics: {
          eligible: eligibleTotal,
          planned: capped.length,
          sent,
          claimConflicts,
          suppressedLastMinute,
          deferred,
          errors,
        },
      };
    });
  } catch (error) {
    await sendCronFailureAlert('lifecycle-emails', error);
    logger.error('Lifecycle email cron failed', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
