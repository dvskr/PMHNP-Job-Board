import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { logAudit } from '@/lib/audit-log';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { verifyCsrf } from '@/lib/csrf';
import { ACCOUNT_RESTORE_DATA } from '@/lib/auth/ensure-profile';

/**
 * POST /api/auth/restore-account — undo a soft-delete during the
 * 30-day grace window. The user must have a valid Supabase session
 * (we don't destroy auth identities until the hard-purge cron runs)
 * and the profile must still have `deleted_at` set.
 *
 * This endpoint is a convenience, not the guarantee: the authoritative
 * restore runs server-side in lib/auth/ensure-profile.ts on the first
 * authenticated request. Before that, a 429 here (the limiter used to key on
 * client IP, so one NAT'd office exhausted it for everyone) left the account
 * marked deleted while its owner kept using it, until the purge cron erased
 * it.
 */
export async function POST(request: NextRequest) {
    const csrfError = verifyCsrf(request);
    if (csrfError) return csrfError;

    try {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Keyed on the authenticated user, and checked only after auth, so
        // shared egress IPs can't lock each other out of their own restore.
        const { success, reset } = await checkRateLimit(`ratelimit:restore-account:${user.id}`, {
            limit: 5,
            windowSeconds: 3600,
        });
        if (!success) {
            const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
            return NextResponse.json(
                { error: 'Too many requests', retryAfter },
                { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
        }

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true, deletedAt: true, purgeAt: true },
        });
        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }
        if (!profile.deletedAt) {
            return NextResponse.json({ error: 'Account is not in a deleted state' }, { status: 400 });
        }
        if (profile.purgeAt && profile.purgeAt.getTime() < Date.now()) {
            return NextResponse.json(
                { error: 'Grace period has lapsed; account cannot be restored' },
                { status: 410 },
            );
        }

        await prisma.userProfile.update({
            where: { id: profile.id },
            // Shared with the login-path restore so the two can't diverge.
            data: { ...ACCOUNT_RESTORE_DATA },
        });

        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
        await logAudit({
            action: 'account.restore',
            actorType: 'user',
            actorId: profile.id,
            targetType: 'user',
            targetId: profile.id,
            ip,
            userAgent: request.headers.get('user-agent'),
        });

        return NextResponse.json({ success: true, message: 'Account restored' });
    } catch (err) {
        logger.error('Restore account error', err);
        return NextResponse.json({ error: 'Failed to restore account' }, { status: 500 });
    }
}
