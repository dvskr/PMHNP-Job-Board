import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * Verify that the request is from an authenticated admin user.
 * Works for API routes (checks Supabase session cookie).
 * Also applies rate limiting (20 req/min per IP).
 *
 * @returns null if authorized, or a NextResponse (401/403/429/500) to return immediately.
 */
export async function requireApiAdmin(request?: NextRequest): Promise<NextResponse | null> {
    try {
        // Rate limiting (IP-based)
        if (request) {
            const rateLimitResult = await rateLimit(request, 'admin', RATE_LIMITS.admin);
            if (rateLimitResult) return rateLimitResult;
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
