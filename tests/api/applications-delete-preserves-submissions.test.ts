/**
 * "Clear history" must never destroy a submitted application.
 *
 * Found 2026-09-13. The /saved Applied tab walks every tracked job id through
 * DELETE /api/applications, and that handler ran a bare
 * `deleteMany({ where: { userId, jobId } })`. In-platform submissions live in
 * the same table (apply-direct writes sourceUrl='platform' + consentGiven with
 * the cover letter, resume pointer and screening answers), so one confirm
 * dialog hard-deleted real applications out from under the employer pipeline.
 *
 * The endpoint now prunes only click-through rows. A submitted application
 * answers 409 and has to go through /withdraw, which scrubs the PII but keeps
 * the record.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const USER_ID = 'supabase-seeker-fic-1';
const JOB_ID = 'job-fic-1';

interface MockUser { id: string }
let mockUser: MockUser | null = null;
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: mockUser }, error: null }) },
    }),
}));

vi.mock('@/lib/rate-limit', () => ({
    rateLimit: async () => null,
    RATE_LIMITS: { general: { limit: 30, windowSeconds: 60 } },
}));

const findUnique = vi.fn();
const deleteMany = vi.fn();
vi.mock('@/lib/prisma', () => ({
    prisma: {
        jobApplication: {
            findUnique: (...a: unknown[]) => findUnique(...a),
            deleteMany: (...a: unknown[]) => deleteMany(...a),
            upsert: vi.fn(),
            findMany: vi.fn(),
        },
    },
}));

import { DELETE } from '@/app/api/applications/route';

function deleteRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost:3000/api/applications', {
        method: 'DELETE',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: USER_ID };
    deleteMany.mockResolvedValue({ count: 1 });
});

describe('DELETE /api/applications', () => {
    it('refuses to delete an in-platform submission', async () => {
        findUnique.mockResolvedValue({ sourceUrl: 'platform', consentGiven: true });

        const res = await DELETE(deleteRequest({ jobId: JOB_ID }));
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.code).toBe('submitted_application');
        expect(deleteMany).not.toHaveBeenCalled();
    });

    it('refuses to delete any row carrying the candidate\'s consent', async () => {
        // Consent is only ever recorded when the candidate pressed submit.
        findUnique.mockResolvedValue({ sourceUrl: null, consentGiven: true });

        const res = await DELETE(deleteRequest({ jobId: JOB_ID }));

        expect(res.status).toBe(409);
        expect(deleteMany).not.toHaveBeenCalled();
    });

    it('still prunes an external click-through row', async () => {
        findUnique.mockResolvedValue({
            sourceUrl: 'https://careers.examplehealth.example/openings/1',
            consentGiven: false,
        });

        const res = await DELETE(deleteRequest({ jobId: JOB_ID }));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(deleteMany).toHaveBeenCalledTimes(1);
    });

    it('re-asserts the discriminator in the delete filter, not just the read', async () => {
        findUnique.mockResolvedValue({ sourceUrl: null, consentGiven: false });

        await DELETE(deleteRequest({ jobId: JOB_ID }));

        const where = deleteMany.mock.calls[0][0].where;
        expect(where.userId).toBe(USER_ID);
        expect(where.jobId).toBe(JOB_ID);
        expect(where.consentGiven).toBe(false);
        // OR keeps NULL sourceUrl rows in scope: `{ not: 'platform' }` alone
        // is NULL for them in SQL and would spare nothing but delete nothing.
        expect(where.OR).toEqual([{ sourceUrl: null }, { sourceUrl: { not: 'platform' } }]);
    });

    it('is idempotent when the row is already gone', async () => {
        findUnique.mockResolvedValue(null);

        const res = await DELETE(deleteRequest({ jobId: JOB_ID }));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.deleted).toBe(false);
        expect(deleteMany).not.toHaveBeenCalled();
    });

    it('rejects an anonymous caller before touching the table', async () => {
        mockUser = null;

        const res = await DELETE(deleteRequest({ jobId: JOB_ID }));

        expect(res.status).toBe(401);
        expect(findUnique).not.toHaveBeenCalled();
        expect(deleteMany).not.toHaveBeenCalled();
    });
});
