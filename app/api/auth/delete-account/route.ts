import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { logAudit } from '@/lib/audit-log';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { verifyCsrf } from '@/lib/csrf';

/**
 * DELETE /api/auth/delete-account — soft-delete the current user.
 *
 * Behaviour change (Sprint 3): we no longer hard-delete on first call.
 * Instead we mark the account `deleted_at = now()` and set
 * `purge_at = now() + 30 days`. The dedicated cron
 * `app/api/cron/purge-soft-deleted/route.ts` removes records whose
 * grace window has lapsed.
 *
 * Why: GDPR Art. 17 grants erasure but allows a brief window for
 * dispute resolution and reversal of mistaken deletions. CCPA imposes
 * the same 45-day response. A 30-day grace satisfies both and gives us
 * an audit-trail anchor.
 */
const PURGE_GRACE_DAYS = 30;

export async function DELETE(request: NextRequest) {
    const rateLimited = await rateLimit(request, 'delete-account', {
        limit: 3,
        windowSeconds: 3600,
    });
    if (rateLimited) return rateLimited;

    const csrfError = verifyCsrf(request);
    if (csrfError) return csrfError;

    try {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const purgeAt = new Date(Date.now() + PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000);
        const updated = await prisma.userProfile.update({
            where: { supabaseId: user.id },
            data: {
                deletedAt: new Date(),
                purgeAt,
                // Hide from employer searches and stop transactional email
                profileVisible: false,
                openToOffers: false,
                emailSuppressed: true,
                emailSuppressedAt: new Date(),
            },
            select: { id: true },
        });

        // Sign the user out — we don't actually destroy the Supabase Auth
        // record until purge-time, so a successful re-login during the
        // grace window restores the account (handled in /restore-account).
        await supabase.auth.signOut();

        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
        await logAudit({
            action: 'account.delete',
            actorType: 'user',
            actorId: updated.id,
            targetType: 'user',
            targetId: updated.id,
            ip,
            userAgent: request.headers.get('user-agent'),
            metadata: { purgeAt: purgeAt.toISOString(), graceDays: PURGE_GRACE_DAYS },
        });

        return NextResponse.json({
            success: true,
            message: 'Account scheduled for deletion',
            purgeAt: purgeAt.toISOString(),
            graceDays: PURGE_GRACE_DAYS,
        });
    } catch (err) {
        logger.error('Soft-delete account error', err);
        return NextResponse.json(
            { error: 'Failed to delete account' },
            { status: 500 },
        );
    }
}
