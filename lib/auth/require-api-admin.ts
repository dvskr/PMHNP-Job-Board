import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, rateLimitByKey, RATE_LIMITS } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * Bucket name for the per-admin budget.
 *
 * Record identifiers are collapsed so that /api/admin/jobs/<id> shares one
 * allowance with its siblings instead of minting a fresh one per record, which
 * would let a loop over ids run unthrottled. Handlers that call
 * requireApiAdmin() without a request share the fallback bucket; they are still
 * throttled, just not separately from each other.
 */
export function adminRateLimitKey(pathname: string | undefined, userId: string): string {
    const route = (pathname ?? 'unknown')
        .split('/')
        .map((segment) => (segment.length > 7 && /\d/.test(segment) ? ':id' : segment))
        .join('/');
    return `ratelimit:admin:${route}:${userId}`;
}

/**
 * Verify that the request is from an authenticated admin user.
 * Works for API routes (checks Supabase session cookie).
 *
 * Rate limiting is two-layered: a loose per-IP guard before the session is
 * known, then the real budget per admin per route group. It used to be a single
 * 20 req/min per-IP bucket shared by every admin endpoint and charged before
 * authentication, so anonymous traffic from the same IP spent the operator's
 * allowance and the console throttled itself just by being browsed.
 *
 * @returns null if authorized, or a NextResponse (401/403/429/500) to return immediately.
 */
export async function requireApiAdmin(request?: NextRequest): Promise<NextResponse | null> {
    try {
        if (request) {
            const ipLimited = await rateLimit(request, 'admin-ip', RATE_LIMITS.adminIp);
            if (ipLimited) return ipLimited;
        }

        const supabase = await createClient();
        const {
            data: { user },
            error,
        } = await supabase.auth.getUser();

        if (error || !user) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { role: true },
        });

        if (!profile || profile.role !== 'admin') {
            return NextResponse.json(
                { error: 'Admin access required' },
                { status: 403 }
            );
        }

        // Keyed on the admin, not the request object, so a handler that calls
        // requireApiAdmin() with no argument (the bulk-email send among them)
        // is throttled as well.
        const adminLimited = await rateLimitByKey(
            adminRateLimitKey(request?.nextUrl?.pathname, user.id),
            RATE_LIMITS.admin,
        );
        if (adminLimited) return adminLimited;

        return null; // Authorized
    } catch (err) {
        // H5 fix: previously the bare `catch {}` returned a generic 401,
        // making auth-infra failures (Supabase outage, Prisma connection
        // drop, misconfigured env) indistinguishable from legitimate
        // "not logged in". Return 500 with a logged error so observability
        // can alert on infra failures vs. expected 401 rejections.
        logger.error('[requireApiAdmin] auth check failed', err, {
            path: request?.nextUrl?.pathname,
        });
        return NextResponse.json(
            { error: 'Authentication infrastructure failure' },
            { status: 500 }
        );
    }
}
