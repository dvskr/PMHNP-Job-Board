import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { logAudit } from '@/lib/audit-log';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';
import { sendInactivityPurgeWarningEmail } from '@/lib/email-service';

export const maxDuration = 300;

/**
 * Daily cron implementing GDPR storage limitation for dormant accounts.
 *
 *   1. Identify job-seeker profiles that haven't been seen in 23 months
 *      and have not yet received the 30-day warning email.
 *      → Send the warning, set purge_warning_email_sent_at = now().
 *
 *   2. Identify profiles that received the warning >= 30 days ago and
 *      are still inactive.
 *      → Soft-delete (set deleted_at + purge_at) so the existing
 *        purge-soft-deleted cron handles physical removal another 30
 *        days later.
 *
 * Total dormant lifecycle: 23 months active threshold + 1 month warning
 * window + 30 day soft-delete grace = ~25 months from last activity to
 * hard delete. Comfortably inside any 24-month "active record" defaults
 * employer customers expect.
 *
 * Activity is keyed off `last_seen_at`, with `updated_at` as a fallback
 * for accounts created before the column was introduced.
 *
 * The Phase 1 warning marker (`purge_warning_email_sent_at`) is stamped
 * ONLY after the warning email is successfully delivered, so an account can
 * never reach Phase 2 soft-delete without having been warned first.
 */
const ACTIVITY_THRESHOLD_DAYS = 30 * 23;       // ~23 months
const WARNING_GRACE_DAYS = 30;
const SOFT_DELETE_GRACE_DAYS = 30;
const BATCH_SIZE = 100;

export async function GET(request: NextRequest) {
    const authError = await verifyCronOrAdmin(request);
    if (authError) return authError;

    try {
        return await withCronTracking('purge-inactive-users', async () => {
        const now = new Date();
        const inactivityCutoff = new Date(now.getTime() - ACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
        const warningCutoff = new Date(now.getTime() - WARNING_GRACE_DAYS * 24 * 60 * 60 * 1000);

        // ── Phase 1: send warnings ─────────────────────────────────────
        const candidatesForWarning = await prisma.userProfile.findMany({
            where: {
                deletedAt: null,
                purgeWarningEmailSentAt: null,
                role: 'job_seeker',
                OR: [
                    { lastSeenAt: { lt: inactivityCutoff } },
                    { lastSeenAt: null, updatedAt: { lt: inactivityCutoff } },
                ],
            },
            select: { id: true, email: true },
            take: BATCH_SIZE,
        });

        let warned = 0;
        for (const u of candidatesForWarning) {
            try {
                // CRITICAL: only stamp the warning marker AFTER the email is
                // actually delivered. The marker is what advances an account to
                // soft-delete (Phase 2), so stamping without sending would erase
                // accounts that were never warned. If the send fails, we skip
                // the stamp — the account simply gets re-attempted next run and
                // never enters the deletion pipeline unwarned.
                if (!u.email) {
                    logger.warn('purge-inactive: skipping warning, no email on profile', { userId: u.id });
                    continue;
                }
                const sendResult = await sendInactivityPurgeWarningEmail(u.email, WARNING_GRACE_DAYS);
                if (!sendResult.success) {
                    logger.error('purge-inactive: warning email failed, not stamping', null, {
                        userId: u.id,
                        error: sendResult.error,
                    });
                    continue;
                }

                await prisma.userProfile.update({
                    where: { id: u.id },
                    data: { purgeWarningEmailSentAt: now },
                });
                await logAudit({
                    action: 'account.purge_warning_sent',
                    actorType: 'system',
                    targetType: 'user',
                    targetId: u.id,
                    metadata: { graceDays: WARNING_GRACE_DAYS },
                });
                warned++;
            } catch (err) {
                logger.error('purge-inactive: warning step failed', err, { userId: u.id });
            }
        }

        // ── Phase 2: soft-delete those still inactive after warning ───
        const candidatesForSoftDelete = await prisma.userProfile.findMany({
            where: {
                deletedAt: null,
                role: 'job_seeker',
                purgeWarningEmailSentAt: { lt: warningCutoff },
                OR: [
                    { lastSeenAt: { lt: inactivityCutoff } },
                    { lastSeenAt: null, updatedAt: { lt: inactivityCutoff } },
                ],
            },
            select: { id: true, email: true },
            take: BATCH_SIZE,
        });

        const purgeAt = new Date(now.getTime() + SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000);
        let softDeleted = 0;
        for (const u of candidatesForSoftDelete) {
            try {
                await prisma.userProfile.update({
                    where: { id: u.id },
                    data: {
                        deletedAt: now,
                        purgeAt,
                        profileVisible: false,
                        openToOffers: false,
                        emailSuppressed: true,
                        emailSuppressedAt: now,
                    },
                });
                await logAudit({
                    action: 'account.inactive_soft_delete',
                    actorType: 'system',
                    targetType: 'user',
                    targetId: u.id,
                    metadata: { purgeAt: purgeAt.toISOString() },
                });
                softDeleted++;
            } catch (err) {
                logger.error('purge-inactive: soft-delete step failed', err, { userId: u.id });
            }
        }

        logger.info('purge-inactive-users complete', { warned, softDeleted });

        return {
            response: NextResponse.json({
                success: true,
                warnedCount: warned,
                softDeletedCount: softDeleted,
                timestamp: now.toISOString(),
            }),
            metrics: { warned, softDeleted },
        };
        });
    } catch (err) {
        await sendCronFailureAlert('purge-inactive-users', err);
        logger.error('Cron purge-inactive-users error', err);
        return NextResponse.json({ error: 'Purge inactive failed' }, { status: 500 });
    }
}
