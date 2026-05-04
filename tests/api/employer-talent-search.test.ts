/**
 * Smoke tests for /api/employer/talent/search — Sprint 1.3.
 *
 * Locks the gates that the route MUST enforce regardless of LLM availability:
 *   - Auth (401 for anon)
 *   - Role check (403 for non-employer)
 *   - Feature flag (404 when disabled)
 *   - Body validation (400 on bad input)
 *   - Daily cost cap (429 when ≥10 reranks already used today)
 *
 * Happy-path scoring is exercised by the eval suite (talent_search_rerank).
 * That layer hits real models; this layer locks the cheap defensive checks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────

interface MockUser { id: string }
let mockUser: MockUser | null = null;
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: mockUser }, error: null }) },
    }),
}));

const isFlagEnabledMock = vi.fn<(flag: string, tenant: unknown) => Promise<boolean>>();
vi.mock('@/lib/ai/feature-flags', () => ({
    isAiFeatureEnabled: (flag: string, tenant: unknown) => isFlagEnabledMock(flag, tenant),
}));

vi.mock('@/lib/rate-limit', () => ({
    rateLimit: async () => null,
    RATE_LIMITS: { employer: { limit: 100, windowSeconds: 60 } },
}));

const findUniqueMock = vi.fn();
const aiCallLogCountMock = vi.fn();
vi.mock('@/lib/prisma', () => ({
    prisma: {
        userProfile: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
        aiCallLog:   { count:      (...args: unknown[]) => aiCallLogCountMock(...args) },
        userProfile_findMany: vi.fn(), // unused but referenced in route after gateway path
    },
}));

vi.mock('@/lib/tier-limits', () => ({
    getEmployerTier: async () => 'pro',
    getEmployerActivePostings: async () => [{ id: 'job-1' }],
}));

import { POST } from '@/app/api/employer/talent/search/route';

function makeRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/employer/talent/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
}

beforeEach(() => {
    mockUser = null;
    isFlagEnabledMock.mockReset();
    findUniqueMock.mockReset();
    aiCallLogCountMock.mockReset();
});

describe('POST /api/employer/talent/search', () => {
    it('returns 401 when caller is anonymous', async () => {
        mockUser = null;
        const res = await POST(makeRequest({ query: 'experienced PMHNP' }));
        expect(res.status).toBe(401);
    });

    it('returns 403 when caller is not an employer or admin', async () => {
        mockUser = { id: 'u1' };
        findUniqueMock.mockResolvedValue({ role: 'job_seeker' });
        const res = await POST(makeRequest({ query: 'experienced PMHNP' }));
        expect(res.status).toBe(403);
    });

    it('returns 404 when ai.employer.talent_search flag is off', async () => {
        mockUser = { id: 'u1' };
        findUniqueMock.mockResolvedValue({ role: 'employer' });
        isFlagEnabledMock.mockResolvedValue(false);
        const res = await POST(makeRequest({ query: 'experienced PMHNP' }));
        expect(res.status).toBe(404);
    });

    it('returns 400 on a too-short query', async () => {
        mockUser = { id: 'u1' };
        findUniqueMock.mockResolvedValue({ role: 'employer' });
        isFlagEnabledMock.mockResolvedValue(true);
        const res = await POST(makeRequest({ query: 'ab' }));
        expect(res.status).toBe(400);
    });

    it('returns 400 on malformed JSON body', async () => {
        mockUser = { id: 'u1' };
        findUniqueMock.mockResolvedValue({ role: 'employer' });
        isFlagEnabledMock.mockResolvedValue(true);
        const res = await POST(makeRequest('{not json'));
        expect(res.status).toBe(400);
    });

    it('returns 429 with reset-time message when daily rerank cap is reached', async () => {
        mockUser = { id: 'u1' };
        findUniqueMock.mockResolvedValue({ role: 'employer' });
        isFlagEnabledMock.mockResolvedValue(true);
        aiCallLogCountMock.mockResolvedValue(10); // at cap

        const res = await POST(makeRequest({ query: 'experienced PMHNP' }));
        expect(res.status).toBe(429);
        const body = await res.json();
        expect(body.error).toBeTruthy();
        expect(body.message).toMatch(/midnight Central Time/i);
        // upgrade CTA was deliberately removed — UI shows a clean
        // reset-time message instead of pushing a paywall.
        expect(body.upgradeCta).toBeUndefined();
    });

    it('does NOT return 429 when caller is below the daily cap', async () => {
        // Confirms the cap is a comparison, not a typo (e.g. >= vs >).
        // The route will continue past the cap branch and we don't care
        // what happens next — only that it isn't 429.
        mockUser = { id: 'u1' };
        findUniqueMock.mockResolvedValue({ role: 'employer' });
        isFlagEnabledMock.mockResolvedValue(true);
        aiCallLogCountMock.mockResolvedValue(9); // one below cap

        const res = await POST(makeRequest({ query: 'experienced PMHNP' }));
        expect(res.status).not.toBe(429);
    });
});
