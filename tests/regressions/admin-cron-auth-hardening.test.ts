/**
 * Two auth-layer defects, both about a gate that was wider or narrower than the
 * thing it guards.
 *
 *   - requireApiAdmin charged one 20 req/min bucket keyed on IP alone, before
 *     the session was known and shared by every /api/admin/* route. An operator
 *     walking through the console exhausted it in a minute (the pages then
 *     rendered the throttle as an empty catalogue), anonymous traffic from the
 *     same IP spent the admin's allowance, and the seven handlers that call
 *     requireApiAdmin() with no request argument, the bulk-email send among
 *     them, skipped the limiter entirely.
 *   - verifyCronOrAdmin skipped authentication whenever NODE_ENV was
 *     'development' and no Vercel env vars were present, so any self-hosted
 *     deployment built that way served the destructive cron routes to anonymous
 *     callers.
 *
 * The real in-memory limiter runs here (no Redis configured under test), so
 * these exercise the budget itself rather than a mocked call.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Hoisted with the vi.mock factories that read them.
const session = vi.hoisted(() => ({
    user: null as { id: string; email: string } | null,
    role: 'admin' as string,
}));

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: session.user }, error: null }) },
    }),
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        userProfile: {
            findUnique: async () => (session.user ? { role: session.role } : null),
        },
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { requireApiAdmin, adminRateLimitKey } from '@/lib/auth/require-api-admin';
import { isUnauthenticatedCronAllowed } from '@/lib/auth/verify-cron-or-admin';
import { RATE_LIMITS } from '@/lib/rate-limit';

function adminRequest(pathname: string, ip: string): NextRequest {
    return new NextRequest(`http://localhost:3000${pathname}`, {
        method: 'GET',
        headers: { 'x-forwarded-for': ip },
    });
}

/** A distinct admin per test, so one test's spent budget is not another's. */
let seq = 0;
function signInAsAdmin(): string {
    seq += 1;
    const id = `supabase-admin-fic-${Date.now()}-${seq}`;
    session.user = { id, email: `admin${seq}@example.test` };
    session.role = 'admin';
    return id;
}

beforeEach(() => {
    vi.clearAllMocks();
    session.user = null;
    session.role = 'admin';
});

describe('the admin budget belongs to an admin, not to an address', () => {
    it('gives two admins on the same address separate allowances', async () => {
        const first = signInAsAdmin();
        const path = '/api/admin/jobs';
        for (let i = 0; i < RATE_LIMITS.admin.limit; i += 1) {
            expect(await requireApiAdmin(adminRequest(path, '203.0.113.10'))).toBeNull();
        }
        const exhausted = await requireApiAdmin(adminRequest(path, '203.0.113.10'));
        expect(exhausted?.status).toBe(429);

        const second = signInAsAdmin();
        expect(second).not.toBe(first);
        expect(await requireApiAdmin(adminRequest(path, '203.0.113.10'))).toBeNull();
    });

    it('does not spend an allowance on a route the admin has not used', async () => {
        signInAsAdmin();
        for (let i = 0; i < RATE_LIMITS.admin.limit; i += 1) {
            await requireApiAdmin(adminRequest('/api/admin/jobs', '203.0.113.11'));
        }
        expect((await requireApiAdmin(adminRequest('/api/admin/jobs', '203.0.113.11')))?.status).toBe(429);

        expect(await requireApiAdmin(adminRequest('/api/admin/users', '203.0.113.11'))).toBeNull();
    });

    it('throttles a handler that calls requireApiAdmin() with no request', async () => {
        signInAsAdmin();
        for (let i = 0; i < RATE_LIMITS.admin.limit; i += 1) {
            expect(await requireApiAdmin()).toBeNull();
        }
        const exhausted = await requireApiAdmin();
        expect(exhausted?.status).toBe(429);
    });

    it('does not let unauthenticated callers spend the admin allowance', async () => {
        const anonymousAttempts = RATE_LIMITS.admin.limit * 2;
        for (let i = 0; i < anonymousAttempts; i += 1) {
            const res = await requireApiAdmin();
            expect(res?.status).toBe(401);
        }

        signInAsAdmin();
        expect(await requireApiAdmin()).toBeNull();
    });

    it('does not let a signed-in non-admin spend the allowance either', async () => {
        signInAsAdmin();
        session.role = 'job_seeker';
        for (let i = 0; i < RATE_LIMITS.admin.limit; i += 1) {
            expect((await requireApiAdmin())?.status).toBe(403);
        }

        session.role = 'admin';
        expect(await requireApiAdmin()).toBeNull();
    });
});

describe('admin rate-limit keys', () => {
    const USER = 'supabase-admin-fic-keys';

    it('separates routes and admins', () => {
        expect(adminRateLimitKey('/api/admin/jobs', USER)).not.toBe(
            adminRateLimitKey('/api/admin/users', USER),
        );
        expect(adminRateLimitKey('/api/admin/jobs', USER)).not.toBe(
            adminRateLimitKey('/api/admin/jobs', 'supabase-admin-fic-other'),
        );
    });

    it('collapses record ids so a loop over rows cannot mint fresh allowances', () => {
        expect(adminRateLimitKey('/api/admin/jobs/clx0000000000000000fic1', USER)).toBe(
            adminRateLimitKey('/api/admin/jobs/clx0000000000000000fic2', USER),
        );
    });

    it('still scopes the fallback bucket to the admin', () => {
        expect(adminRateLimitKey(undefined, USER)).toContain(USER);
        expect(adminRateLimitKey(undefined, USER)).not.toBe(
            adminRateLimitKey(undefined, 'supabase-admin-fic-other'),
        );
    });
});

describe('the cron bypass is not decided by NODE_ENV alone', () => {
    const local = { NODE_ENV: 'development' } as NodeJS.ProcessEnv;

    it('stays open for a local checkout with no cron secret to present', () => {
        expect(isUnauthenticatedCronAllowed(local)).toBe(true);
    });

    it('closes as soon as a cron secret is configured', () => {
        expect(
            isUnauthenticatedCronAllowed({ ...local, CRON_SECRET: 'fictional-secret' }),
        ).toBe(false);
    });

    it('closes on a Vercel deployment however NODE_ENV is set', () => {
        expect(isUnauthenticatedCronAllowed({ ...local, VERCEL: '1' })).toBe(false);
        expect(isUnauthenticatedCronAllowed({ ...local, VERCEL_ENV: 'preview' })).toBe(false);
    });

    it('closes in production', () => {
        expect(isUnauthenticatedCronAllowed({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
    });
});
