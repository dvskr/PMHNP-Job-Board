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
 *   3. In NODE_ENV=development, both are skipped.
 *
 * Returns null when authorized; otherwise a 401 NextResponse the caller
 * should return immediately.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function verifyCronOrAdmin(req: Request): Promise<NextResponse | null> {
    // P5.A fix (2026-06-01): the dev short-circuit was too broad. Vercel
    // preview deployments and Next.js dev-server tests both set
    // NODE_ENV !== 'production' (preview = "production" actually, but
    // some tooling sets it to "development"), so the guard would silently
    // skip auth in environments other than local dev. Tighten to "local
    // CLI only" by also requiring no public deployment URL.
    //
    // Allowlist: NODE_ENV=development AND not running on Vercel.
    if (
        process.env.NODE_ENV === 'development' &&
        !process.env.VERCEL &&
        !process.env.VERCEL_ENV
    ) {
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
