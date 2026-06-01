/**
 * C3 regression — when a soft-deleted account's grace period lapses,
 * the purge-soft-deleted cron must remove ALL PII, not just the profile
 * row + Supabase auth identity.
 *
 * What must happen on purge:
 *   1. Resume file deleted from Supabase Storage
 *   2. Avatar file deleted from Supabase Storage (if present)
 *   3. CandidateEmbedding row deleted (input_hash + 1536-dim vector)
 *   4. EmailSend rows for that address anonymized (recipient → redacted)
 *   5. UserProfile row deleted
 *   6. Supabase Auth identity deleted
 *
 * Pre-fix code only did steps 5 + 6 (the audit-runbook C3 finding).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

const deleteFileMock = vi.fn().mockResolvedValue(undefined);
const adminDeleteUserMock = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/lib/supabase-storage', () => ({
    deleteFile: (...args: unknown[]) => deleteFileMock(...args),
    getPathFromUrl: (url: string) => {
        // Mirror the real helper enough for the test
        const m = url.match(/\/(resumes|avatars)\/(.+)$/);
        return m ? m[2] : null;
    },
}));
vi.mock('@/lib/audit-log', () => ({
    logAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/discord-notifier', () => ({
    sendCronFailureAlert: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/auth/verify-cron-or-admin', () => ({
    verifyCronOrAdmin: vi.fn().mockResolvedValue(null),
}));
vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn().mockReturnValue({
        auth: { admin: { deleteUser: adminDeleteUserMock } },
    }),
}));

function fakeRequest(): Request {
    return new Request('https://example.com/api/cron/purge-soft-deleted', {
        headers: { 'authorization': 'Bearer ' + (process.env.CRON_SECRET ?? 'test') },
    });
}

describe('purge-soft-deleted C3 — full PII erasure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_test';
    });

    it('deletes resume + avatar + embedding + anonymizes email_sends + drops profile + deletes auth', async () => {
        vi.mocked(prisma.userProfile.findMany).mockResolvedValue([
            {
                id: 'u1',
                supabaseId: 'sb1',
                email: 'gone@example.com',
                resumeUrl: 'https://test.supabase.co/storage/v1/object/public/resumes/u1/cv.pdf',
                avatarUrl: 'https://test.supabase.co/storage/v1/object/public/avatars/u1/me.jpg',
            },
        ] as never);
        vi.mocked(prisma.candidateEmbedding.delete).mockResolvedValue({} as never);
        vi.mocked(prisma.emailSend.updateMany).mockResolvedValue({ count: 7 } as never);
        vi.mocked(prisma.userProfile.delete).mockResolvedValue({} as never);

        const { GET } = await import('@/app/api/cron/purge-soft-deleted/route');
        const res = await GET(fakeRequest() as never);

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.purgedCount).toBe(1);

        // Storage
        expect(deleteFileMock).toHaveBeenCalledWith('u1/cv.pdf', 'resume');
        expect(deleteFileMock).toHaveBeenCalledWith('u1/me.jpg', 'avatar');
        // Embedding
        expect(prisma.candidateEmbedding.delete).toHaveBeenCalledWith({ where: { supabaseId: 'sb1' } });
        // Email anonymization
        expect(prisma.emailSend.updateMany).toHaveBeenCalledWith({
            where: { to: 'gone@example.com' },
            data: expect.objectContaining({ to: expect.stringContaining('redacted') }),
        });
        // Profile + auth
        expect(prisma.userProfile.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
        expect(adminDeleteUserMock).toHaveBeenCalledWith('sb1');
    });

    it('continues to delete auth + profile even if resume delete fails', async () => {
        vi.mocked(prisma.userProfile.findMany).mockResolvedValue([
            {
                id: 'u2', supabaseId: 'sb2', email: 'g2@example.com',
                resumeUrl: 'https://test.supabase.co/storage/v1/object/public/resumes/u2/cv.pdf',
                avatarUrl: null,
            },
        ] as never);
        deleteFileMock.mockRejectedValueOnce(new Error('storage 500'));
        vi.mocked(prisma.candidateEmbedding.delete).mockResolvedValue({} as never);
        vi.mocked(prisma.emailSend.updateMany).mockResolvedValue({ count: 0 } as never);
        vi.mocked(prisma.userProfile.delete).mockResolvedValue({} as never);

        const { GET } = await import('@/app/api/cron/purge-soft-deleted/route');
        const res = await GET(fakeRequest() as never);

        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json.purgedCount).toBe(1);
        // Profile still dropped despite the storage failure (defensive design)
        expect(prisma.userProfile.delete).toHaveBeenCalledWith({ where: { id: 'u2' } });
        expect(adminDeleteUserMock).toHaveBeenCalledWith('sb2');
    });

    it('survives missing embedding (P2025) silently', async () => {
        vi.mocked(prisma.userProfile.findMany).mockResolvedValue([
            { id: 'u3', supabaseId: 'sb3', email: 'g3@example.com', resumeUrl: null, avatarUrl: null },
        ] as never);
        const notFound: Error & { code?: string } = new Error('not found');
        notFound.code = 'P2025';
        vi.mocked(prisma.candidateEmbedding.delete).mockRejectedValue(notFound);
        vi.mocked(prisma.emailSend.updateMany).mockResolvedValue({ count: 0 } as never);
        vi.mocked(prisma.userProfile.delete).mockResolvedValue({} as never);

        const { GET } = await import('@/app/api/cron/purge-soft-deleted/route');
        const res = await GET(fakeRequest() as never);

        expect(res.status).toBe(200);
        // Profile still purged
        expect(prisma.userProfile.delete).toHaveBeenCalledWith({ where: { id: 'u3' } });
    });

    it('no-ops when nothing is due', async () => {
        vi.mocked(prisma.userProfile.findMany).mockResolvedValue([] as never);
        const { GET } = await import('@/app/api/cron/purge-soft-deleted/route');
        const res = await GET(fakeRequest() as never);
        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json.purgedCount).toBe(0);
        expect(deleteFileMock).not.toHaveBeenCalled();
        expect(prisma.candidateEmbedding.delete).not.toHaveBeenCalled();
    });
});
