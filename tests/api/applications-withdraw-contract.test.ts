/**
 * Withdraw is keyed on the APPLICATION id, and the page has to send that.
 *
 * Found 2026-09-13. /my-applications posted `{ jobId }` to
 * DELETE /api/applications/withdraw, which requires `{ applicationId }` and
 * answers 400. The page only updated state inside `if (res.ok)` and its catch
 * was a bare "silently fail", so the only erasure path a candidate has was a
 * permanent no-op: the spinner stopped and nothing else happened, on every
 * click, for every user.
 *
 * These tests pin the route contract and the request the page actually sends.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

const USER_ID = 'supabase-seeker-fic-1';
const OTHER_USER = 'supabase-seeker-fic-2';
const APPLICATION_ID = 'app-fic-1';

interface MockUser { id: string }
let mockUser: MockUser | null = null;
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: mockUser }, error: null }) },
    }),
}));

const findUnique = vi.fn();
const update = vi.fn();
vi.mock('@/lib/prisma', () => ({
    prisma: {
        jobApplication: {
            findUnique: (...a: unknown[]) => findUnique(...a),
            update: (...a: unknown[]) => update(...a),
        },
    },
}));

import { DELETE as withdraw } from '@/app/api/applications/withdraw/route';

function withdrawRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost:3000/api/applications/withdraw', {
        method: 'DELETE',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: USER_ID };
    findUnique.mockResolvedValue({ userId: USER_ID, jobId: 'job-fic-1' });
    update.mockResolvedValue({});
});

describe('DELETE /api/applications/withdraw', () => {
    it('scrubs the row and marks it withdrawn for the owner', async () => {
        const res = await withdraw(withdrawRequest({ applicationId: APPLICATION_ID }));

        expect(res.status).toBe(200);
        const data = update.mock.calls[0][0].data;
        expect(data.status).toBe('withdrawn');
        expect(data.coverLetter).toBeNull();
        expect(data.resumeUrl).toBeNull();
        expect(data.withdrawnAt).toBeInstanceOf(Date);
    });

    it('answers 400 for a jobId-only body: the shape the page used to send', async () => {
        const res = await withdraw(withdrawRequest({ jobId: 'job-fic-1' }));

        expect(res.status).toBe(400);
        expect(update).not.toHaveBeenCalled();
    });

    it('refuses to withdraw another candidate\'s application', async () => {
        findUnique.mockResolvedValue({ userId: OTHER_USER, jobId: 'job-fic-1' });

        const res = await withdraw(withdrawRequest({ applicationId: APPLICATION_ID }));

        expect(res.status).toBe(403);
        expect(update).not.toHaveBeenCalled();
    });
});

describe('app/my-applications/page.tsx', () => {
    const src = fs.readFileSync(
        path.join(process.cwd(), 'app/my-applications/page.tsx'),
        'utf8',
    );

    it('posts the applicationId the route requires', () => {
        expect(src).toContain('JSON.stringify({ applicationId })');
        expect(src).not.toContain('JSON.stringify({ jobId })');
    });

    it('surfaces a failed withdrawal instead of swallowing it', () => {
        expect(src).toContain('setWithdrawError');
        expect(src).not.toContain('// Silently fail');
    });
});
