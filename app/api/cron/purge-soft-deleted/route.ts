import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { logAudit } from '@/lib/audit-log';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';

export const maxDuration = 300; // 5 minutes — could be many users

/**
 * Daily cron: hard-delete UserProfile rows whose 30-day grace period
 * has lapsed (`purge_at <= now()`). Cascades through Prisma relations
 * (applications, messages, saved jobs, etc.) and removes the matching
 * Supabase Auth identity so the email can be re-registered.
 *
 * Bounded to 50 records per run so a backlog can't blow the function
 * timeout. Anything left over rolls into the next day's run.
 */
const BATCH_SIZE = 50;

export async function GET(request: NextRequest) {
    const authError = await verifyCronOrAdmin(request);
    if (authError) return authError;

    try {
        const due = await prisma.userProfile.findMany({
            where: {
                deletedAt: { not: null },
                purgeAt: { lte: new Date() },
            },
            select: { id: true, supabaseId: true, email: true },
            take: BATCH_SIZE,
            orderBy: { purgeAt: 'asc' },
        });

        if (due.length === 0) {
            return NextResponse.json({ success: true, purgedCount: 0 });
        }

        const adminSupabase = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        let purged = 0;
        const failures: Array<{ id: string; reason: string }> = [];

        for (const u of due) {
            try {
                // Cascade-delete via Prisma. If FK constraints aren't all
                // configured for cascade, individual relations will need
                // their own pruning step in a follow-up commit; for now
                // most user-owned relations have onDelete: Cascade.
                await prisma.userProfile.delete({ where: { id: u.id } });
                await adminSupabase.auth.admin.deleteUser(u.supabaseId);
                await logAudit({
                    action: 'account.purge',
                    actorType: 'system',
                    targetType: 'user',
                    targetId: u.id,
                    metadata: { email: u.email },
                });
                purged++;
            } catch (err) {
                failures.push({ id: u.id, reason: err instanceof Error ? err.message : 'unknown' });
                logger.error('purge-soft-deleted: failed to purge user', err, { userId: u.id });
            }
        }

        logger.info('purge-soft-deleted complete', { purged, failures: failures.length });

        return NextResponse.json({
            success: true,
            purgedCount: purged,
            failures,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        await sendCronFailureAlert('purge-soft-deleted', err);
        logger.error('Cron purge-soft-deleted error', err);
        return NextResponse.json({ error: 'Purge failed' }, { status: 500 });
    }
}
