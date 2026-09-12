/**
 * Erasure has to take the rows that keep mailing the erased address.
 *
 * Found 2026-09-03: the purge cron deleted the résumé files, the candidate
 * embedding, the profile row and the Supabase identity, but never the
 * JobAlert / EmailLead rows. Those key on the email string with no FK to the
 * profile, so no cascade reaches them. During the grace window the address is
 * muted only by user_profiles.email_suppressed (isEmailSuppressed ORs it with
 * the EmailLead flag) — and the purge deletes the row holding it. Afterwards
 * email_leads.is_suppressed was still false, the confirmed alert still held
 * the raw address plus a live unsubscribe token, and the digests resumed to an
 * address we had told the user was erased.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const PURGED_EMAIL = 'erased-candidate@examplepsych.example';

const calls: string[] = [];
const track = <T,>(name: string, result: T) => (...args: unknown[]) => {
    calls.push(name);
    void args;
    return Promise.resolve(result) as Promise<T>;
};

const userProfileFindMany = vi.fn();
const userProfileDelete = vi.fn(track('userProfile.delete', { id: 'profile-fic-1' }));
const jobAlertDeleteMany = vi.fn(track('jobAlert.deleteMany', { count: 2 }));
const emailLeadDeleteMany = vi.fn(track('emailLead.deleteMany', { count: 1 }));
const emailSendUpdateMany = vi.fn(track('emailSend.updateMany', { count: 3 }));
const candidateEmbeddingDelete = vi.fn(async () => {
    throw Object.assign(new Error('not found'), { code: 'P2025' });
});

vi.mock('@/lib/prisma', () => ({
    prisma: {
        userProfile: {
            findMany: (...a: unknown[]) => userProfileFindMany(...a),
            delete: (...a: unknown[]) => userProfileDelete(...a),
        },
        jobAlert: { deleteMany: (...a: unknown[]) => jobAlertDeleteMany(...a) },
        emailLead: { deleteMany: (...a: unknown[]) => emailLeadDeleteMany(...a) },
        emailSend: { updateMany: (...a: unknown[]) => emailSendUpdateMany(...a) },
        candidateEmbedding: { delete: (...a: unknown[]) => candidateEmbeddingDelete(...(a as [])) },
    },
}));

const adminDeleteUser = vi.fn(track('auth.admin.deleteUser', { data: {}, error: null }));
vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({ auth: { admin: { deleteUser: (...a: unknown[]) => adminDeleteUser(...a) } } }),
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/audit-log', () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock('@/lib/auth/verify-cron-or-admin', () => ({ verifyCronOrAdmin: async () => null }));
vi.mock('@/lib/discord-notifier', () => ({ sendCronFailureAlert: vi.fn(async () => undefined) }));
vi.mock('@/lib/supabase-storage', () => ({
    deleteFile: vi.fn(async () => undefined),
    getPathFromUrl: () => null,
}));
vi.mock('@/lib/cron/track', () => ({
    withCronTracking: async (_name: string, fn: () => Promise<{ response: Response }>) => (await fn()).response,
}));

import { GET } from '@/app/api/cron/purge-soft-deleted/route';

function dueUser() {
    return {
        id: 'profile-fic-1',
        supabaseId: 'supabase-user-fic-1',
        email: PURGED_EMAIL,
        resumeUrl: null,
        avatarUrl: null,
    };
}

function cronRequest() {
    return new NextRequest('http://localhost/api/cron/purge-soft-deleted');
}

beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    userProfileFindMany.mockResolvedValue([dueUser()]);
});

describe('purge-soft-deleted', () => {
    it('deletes the job alerts and the email lead for the purged address', async () => {
        const res = await GET(cronRequest());
        const body = await res.json();

        expect(body.purgedCount).toBe(1);
        expect(jobAlertDeleteMany).toHaveBeenCalledWith({
            where: { email: { equals: PURGED_EMAIL, mode: 'insensitive' } },
        });
        expect(emailLeadDeleteMany).toHaveBeenCalledWith({
            where: { email: { equals: PURGED_EMAIL, mode: 'insensitive' } },
        });
    });

    it('takes the alert before its email lead, and both before the profile', () => {
        // JobAlert.email is a required relation to EmailLead, so the parent
        // cannot go first; and the profile carries the suppression flag that
        // is the only thing muting the address until the rows are gone.
        return GET(cronRequest()).then(() => {
            expect(calls.indexOf('jobAlert.deleteMany')).toBeLessThan(calls.indexOf('emailLead.deleteMany'));
            expect(calls.indexOf('emailLead.deleteMany')).toBeLessThan(calls.indexOf('userProfile.delete'));
        });
    });

    it('fails closed: a failed mailing-row cleanup does not go on to drop the profile', async () => {
        jobAlertDeleteMany.mockRejectedValueOnce(new Error('deadlock detected'));

        const res = await GET(cronRequest());
        const body = await res.json();

        expect(userProfileDelete).not.toHaveBeenCalled();
        expect(adminDeleteUser).not.toHaveBeenCalled();
        expect(body.purgedCount).toBe(0);
        expect(body.failures).toHaveLength(1);
    });
});
