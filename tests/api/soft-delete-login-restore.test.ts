/**
 * A soft-deleted account must be restored by logging back in, and must never
 * keep a working session past its restore window.
 *
 * Found 2026-09-03: the only restore that existed was a fire-and-forget
 * `fetch('/api/auth/restore-account')` on the password login form, whose
 * response was discarded. That endpoint rate-limited on client IP before it
 * authenticated, so the sixth login of the hour from one NAT'd office got a
 * 429 that looked exactly like success; Google logins never called it at all.
 * Nothing else in the session path looked at `deleted_at`, so the account kept
 * full access while still marked deleted, and the purge cron hard-deleted it
 * 30 days later. That is silent data loss for a user who explicitly undid
 * their deletion.
 *
 * The restore now happens server-side in ensureProfileFromAuth, which every
 * authenticated path funnels through, and the gate fails closed once the
 * window has lapsed.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { User } from '@supabase/supabase-js';
import type { PrismaClient } from '@prisma/client';

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const logAudit = vi.fn(async () => undefined);
vi.mock('@/lib/audit-log', () => ({ logAudit: (...a: unknown[]) => logAudit(...(a as [])) }));

import { ensureProfileFromAuth, ACCOUNT_RESTORE_DATA } from '@/lib/auth/ensure-profile';

const ROOT = process.cwd();
const DAY = 24 * 60 * 60 * 1000;

const findUnique = vi.fn();
const findFirst = vi.fn();
const update = vi.fn();
const create = vi.fn();
const prisma = {
    userProfile: { findUnique, findFirst, update, create },
} as unknown as PrismaClient;

function authUser(): User {
    return {
        id: 'supabase-user-fic-1',
        email: 'candidate@examplepsych.example',
        user_metadata: {},
        app_metadata: {},
        aud: 'authenticated',
        created_at: '2026-09-03T00:00:00.000Z',
    } as unknown as User;
}

function profileRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'profile-fic-1',
        supabaseId: 'supabase-user-fic-1',
        email: 'candidate@examplepsych.example',
        role: 'job_seeker',
        deletedAt: null,
        purgeAt: null,
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('ensureProfileFromAuth soft-delete gate', () => {
    it('leaves a live account alone', async () => {
        findUnique.mockResolvedValue(profileRow());

        const result = await ensureProfileFromAuth(prisma, authUser(), { logSource: 'test' });

        expect(result).toMatchObject({ id: 'profile-fic-1' });
        expect(update).not.toHaveBeenCalled();
        expect(logAudit).not.toHaveBeenCalled();
    });

    it('restores an account soft-deleted inside its grace window', async () => {
        findUnique.mockResolvedValue(
            profileRow({ deletedAt: new Date(Date.now() - DAY), purgeAt: new Date(Date.now() + 29 * DAY) }),
        );
        update.mockResolvedValue(profileRow());

        const result = await ensureProfileFromAuth(prisma, authUser(), { logSource: 'requireAuth' });

        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][0]).toMatchObject({
            where: { id: 'profile-fic-1' },
            data: { deletedAt: null, purgeAt: null, emailSuppressed: false },
        });
        expect(result).toMatchObject({ id: 'profile-fic-1', deletedAt: null });
        expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'account.restore' }));
    });

    it('restores when a soft-delete carries no purge date at all', async () => {
        findUnique.mockResolvedValue(profileRow({ deletedAt: new Date(Date.now() - DAY), purgeAt: null }));
        update.mockResolvedValue(profileRow());

        await ensureProfileFromAuth(prisma, authUser(), { logSource: 'requireAuth' });

        expect(update).toHaveBeenCalledTimes(1);
    });

    it('refuses the session once the restore window has lapsed, and restores nothing', async () => {
        findUnique.mockResolvedValue(
            profileRow({ deletedAt: new Date(Date.now() - 31 * DAY), purgeAt: new Date(Date.now() - DAY) }),
        );

        const result = await ensureProfileFromAuth(prisma, authUser(), { logSource: 'requireAuth' });

        expect(result).toBeNull();
        expect(update).not.toHaveBeenCalled();
    });

    it('applies the same gate to a profile found by email after a relink', async () => {
        findUnique.mockResolvedValue(null);
        findFirst.mockResolvedValue(
            profileRow({ supabaseId: 'supabase-user-fic-OLD', deletedAt: new Date(Date.now() - DAY) }),
        );
        // First update = relink, second = restore.
        update
            .mockResolvedValueOnce(profileRow({ deletedAt: new Date(Date.now() - DAY) }))
            .mockResolvedValueOnce(profileRow());

        const result = await ensureProfileFromAuth(prisma, authUser(), { logSource: 'requireAuth' });

        expect(update).toHaveBeenCalledTimes(2);
        expect(result).toMatchObject({ deletedAt: null });
    });

    it('carries the caller include through the restore write', async () => {
        findUnique.mockResolvedValue(profileRow({ deletedAt: new Date(Date.now() - DAY) }));
        update.mockResolvedValue(profileRow());
        const include = { licenses: true };

        await ensureProfileFromAuth(prisma, authUser(), { include, logSource: 'GET /api/auth/profile' });

        expect(update.mock.calls[0][0]).toMatchObject({ include });
    });
});

describe('ACCOUNT_RESTORE_DATA', () => {
    it('undoes every field the soft-delete set', () => {
        expect(ACCOUNT_RESTORE_DATA).toEqual({
            deletedAt: null,
            purgeAt: null,
            profileVisible: true,
            openToOffers: true,
            emailSuppressed: false,
            emailSuppressedAt: null,
        });
    });
});

describe('session paths honour the gate', () => {
    const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

    it('requireAuth bounces a session with no usable profile instead of rendering', () => {
        const src = read('lib/auth/protect.ts');
        expect(src).toMatch(/if\s*\(!profile\)\s*\{[\s\S]*redirect\('\/login\?error=account_unavailable'\)/);
    });

    it('getCurrentUser reads a soft-deleted account as signed out', () => {
        const src = read('lib/auth/protect.ts');
        expect(src).toMatch(/profile\?\.deletedAt/);
    });

    it('/api/auth/me selects deletedAt and refuses to report a deleted identity', () => {
        const src = read('app/api/auth/me/route.ts');
        expect(src).toMatch(/deletedAt:\s*true/);
        expect(src).toMatch(/if\s*\(profile\?\.deletedAt\)/);
    });

    it('the OAuth callback runs the restore too, and fails closed if it cannot', () => {
        const src = read('app/auth/callback/route.ts');
        expect(src).toContain('restoreIfWithinGrace');
        expect(src).toMatch(/purge_pending[\s\S]*signOut\(\)/);
    });

    it('restore-account rate-limits per user, after authenticating, not per IP before', () => {
        const src = read('app/api/auth/restore-account/route.ts');
        expect(src).toContain('ratelimit:restore-account:${user.id}');
        // The IP-keyed helper ran before auth.getUser and is what produced the
        // 429 that the login form read as success.
        expect(src).not.toMatch(/rateLimit\(request/);
        expect(src.indexOf('auth.getUser()')).toBeLessThan(src.indexOf('await checkRateLimit'));
    });

    it('the login form stops treating a failed restore probe as success', () => {
        const src = read('components/auth/LoginContent.tsx');
        expect(src).toMatch(/restore\.status === 410/);
        expect(src).not.toMatch(/await fetch\('\/api\/auth\/restore-account', \{ method: 'POST' \}\);\s*\n\s*\} catch/);
    });
});
