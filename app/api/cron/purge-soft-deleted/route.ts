import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { logAudit } from '@/lib/audit-log';
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { deleteFile, getPathFromUrl } from '@/lib/supabase-storage';
import { withCronTracking } from '@/lib/cron/track';

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
        return await withCronTracking('purge-soft-deleted', async () => {
        const due = await prisma.userProfile.findMany({
            where: {
                deletedAt: { not: null },
                purgeAt: { lte: new Date() },
            },
            // C3 fix (2026-06-01): we additionally need resumeUrl + avatarUrl
            // to wipe storage files, and supabaseId to drop the candidate
            // embedding + anonymize email_sends rows. The prior version only
            // pulled id/supabaseId/email and silently left PII on the side.
            select: { id: true, supabaseId: true, email: true, resumeUrl: true, avatarUrl: true },
            take: BATCH_SIZE,
            orderBy: { purgeAt: 'asc' },
        });

        if (due.length === 0) {
            return {
                response: NextResponse.json({ success: true, purgedCount: 0 }),
                metrics: { purgedCount: 0, failures: 0 },
            };
        }

        const adminSupabase = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        let purged = 0;
        const failures: Array<{ id: string; reason: string }> = [];

        for (const u of due) {
            try {
                // C3 fix (2026-06-01): full PII purge — privacy policy promises
                // erasure but the prior version left résumé files, candidate
                // embeddings, and email_sends rows behind. Now each lifecycle
                // step is loud-on-failure and survives partial damage so a
                // single missing file doesn't strand the rest of the user's PII.

                // Step 1: storage files (resume + avatar). Failures here are
                // logged but don't abort the row — better to drop the DB row
                // than to retain DB linkage to an undeletable file.
                if (u.resumeUrl) {
                    const path = getPathFromUrl(u.resumeUrl);
                    if (path) {
                        try {
                            await deleteFile(path, 'resume');
                        } catch (storageErr) {
                            logger.error('purge-soft-deleted: failed to delete resume file', storageErr, { userId: u.id, path });
                        }
                    }
                }
                if (u.avatarUrl) {
                    const path = getPathFromUrl(u.avatarUrl);
                    if (path) {
                        try {
                            await deleteFile(path, 'avatar');
                        } catch (storageErr) {
                            logger.error('purge-soft-deleted: failed to delete avatar file', storageErr, { userId: u.id, path });
                        }
                    }
                }

                // Step 2: candidate embedding (no FK to user; orphan-cleanable
                // but we should be explicit during a privacy purge).
                try {
                    await prisma.candidateEmbedding.delete({ where: { supabaseId: u.supabaseId } });
                } catch (embedErr) {
                    // P2025 = not found = nothing to delete. Anything else is loud.
                    const code = (embedErr as { code?: string } | null)?.code;
                    if (code !== 'P2025') {
                        logger.error('purge-soft-deleted: failed to delete candidate embedding', embedErr, { userId: u.id });
                    }
                }

                // Step 3: anonymize email_sends so downstream funnel queries
                // still work but the email address is gone. Bulk update —
                // these are append-only metric rows, not domain entities.
                try {
                    await prisma.emailSend.updateMany({
                        where: { to: u.email },
                        data: { to: 'redacted+purged@pmhnphiring.invalid', metadata: undefined },
                    });
                } catch (emailErr) {
                    logger.error('purge-soft-deleted: failed to anonymize email_sends', emailErr, { userId: u.id });
                }

                // Step 4: drop the profile row. Cascade-delete via Prisma. If
                // FK constraints aren't all configured for cascade, individual
                // relations will need their own pruning step in a follow-up
                // commit; for now most user-owned relations have onDelete: Cascade.
                await prisma.userProfile.delete({ where: { id: u.id } });

                // Step 5: drop the Supabase Auth identity so the email is reusable.
                await adminSupabase.auth.admin.deleteUser(u.supabaseId);

                await logAudit({
                    action: 'account.purge',
                    actorType: 'system',
                    targetType: 'user',
                    targetId: u.id,
                    metadata: {
                        email: u.email,
                        hadResume: u.resumeUrl != null,
                        hadAvatar: u.avatarUrl != null,
                    },
                });
                purged++;
            } catch (err) {
                failures.push({ id: u.id, reason: err instanceof Error ? err.message : 'unknown' });
                logger.error('purge-soft-deleted: failed to purge user', err, { userId: u.id });
            }
        }

        logger.info('purge-soft-deleted complete', { purged, failures: failures.length });

        return {
            response: NextResponse.json({
                success: true,
                purgedCount: purged,
                failures,
                timestamp: new Date().toISOString(),
            }),
            metrics: { purgedCount: purged, failures: failures.length },
        };
        });
    } catch (err) {
        await sendCronFailureAlert('purge-soft-deleted', err);
        logger.error('Cron purge-soft-deleted error', err);
        return NextResponse.json({ error: 'Purge failed' }, { status: 500 });
    }
}
