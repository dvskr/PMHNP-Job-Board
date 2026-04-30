import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { logAudit } from '@/lib/audit-log';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { verifyCsrf } from '@/lib/csrf';

/**
 * POST /api/auth/restore-account — undo a soft-delete during the
 * 30-day grace window. The user must have a valid Supabase session
 * (we don't destroy auth identities until the hard-purge cron runs)
 * and the profile must still have `deleted_at` set.
 */
export async function POST(request: NextRequest) {
    const rateLimited = await rateLimit(request, 'restore-account', {
        limit: 5,
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
            data: {
                deletedAt: null,
                purgeAt: null,
                profileVisible: true,
                openToOffers: true,
                emailSuppressed: false,
                emailSuppressedAt: null,
            },
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
