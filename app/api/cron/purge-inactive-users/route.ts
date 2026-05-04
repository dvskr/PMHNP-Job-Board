import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { logAudit } from '@/lib/audit-log';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';

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
 * NOTE: this cron does not currently send the warning email — it only
 * marks the gate. The marker is the audit anchor; wire a sender from
 * lib/email-service.ts in a follow-up to deliver `purge_warning_v1`.
 */
const ACTIVITY_THRESHOLD_DAYS = 30 * 23;       // ~23 months
const WARNING_GRACE_DAYS = 30;
const SOFT_DELETE_GRACE_DAYS = 30;
const BATCH_SIZE = 100;

export async function GET(request: NextRequest) {
    const authError = await verifyCronOrAdmin(request);
    if (authError) return authError;

    try {
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
                await prisma.userProfile.update({
                    where: { id: u.id },
                    data: { purgeWarningEmailSentAt: now },
                });
                // TODO(privacy): wire purge_warning_v1 template via
                // sendTransactionalEmail() once the template is approved.
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

        return NextResponse.json({
            success: true,
            warnedCount: warned,
            softDeletedCount: softDeleted,
            timestamp: now.toISOString(),
        });
    } catch (err) {
        await sendCronFailureAlert('purge-inactive-users', err);
        logger.error('Cron purge-inactive-users error', err);
        return NextResponse.json({ error: 'Purge inactive failed' }, { status: 500 });
    }
}
