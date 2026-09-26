/**
 * Auth helper for cron endpoints that should also be manually triggerable
 * from the admin panel.
 *
 * Vercel cron sends `Authorization: Bearer <CRON_SECRET>`. Admins clicking
 * "Trigger manually" from /admin/cron send a same-origin request with their
 * Supabase session cookie but no bearer token.
 *
 * This helper accepts either:
 *   1. Bearer-token match against `CRON_SECRET` (Vercel cron path).
 *   2. An authenticated admin session (manual trigger path).
 *   3. A checkout that has no CRON_SECRET to check against, in local
 *      development only (see isUnauthenticatedCronAllowed).
 *
 * Returns null when authorized; otherwise a 401 NextResponse the caller
 * should return immediately.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * The open door, and why it is this narrow.
 *
 * P5.A (2026-06-01) required NODE_ENV=development and no Vercel env, which
 * still meant NODE_ENV alone decided it: any self-hosted deployment that runs
 * with NODE_ENV=development served every cron route, including the destructive
 * purges, to anonymous callers. NODE_ENV describes a build, not a trust
 * boundary.
 *
 * A deployment that runs crons has a CRON_SECRET, so its presence is the
 * signal that there is something to authenticate against: once it is set, the
 * bearer token and the admin session are the only ways in, on every host. What
 * is left open is a fresh local checkout with no secret configured, where
 * there is no credential to present and nothing deployed to reach.
 *
 * Exported so the gate can be tested without standing up Supabase or Prisma.
 */
export function isUnauthenticatedCronAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
    return (
        env.NODE_ENV === 'development' &&
        !env.VERCEL &&
        !env.VERCEL_ENV &&
        !env.CRON_SECRET
    );
}

export async function verifyCronOrAdmin(req: Request): Promise<NextResponse | null> {
    if (isUnauthenticatedCronAllowed()) {
        return null;
    }

    // Fast path: Vercel cron's bearer token.
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
        return null;
    }

    // Slow path: admin session via Supabase cookie.
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { role: true },
        });
        if (profile?.role !== 'admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }
        return null;
    } catch (err) {
        // H5 fix: previously the bare `catch {}` returned a generic 401,
        // making Supabase/Prisma infra failures invisible in observability.
        // Log + 500 so a real auth-infra outage triggers alerting instead
        // of being misclassified as a normal 401.
        logger.error('[verifyCronOrAdmin] auth check failed', err);
        return NextResponse.json(
            { error: 'Authentication infrastructure failure' },
            { status: 500 },
        );
    }
}
