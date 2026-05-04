/**
 * Smoke tests for /api/jobs/search/semantic. The full happy path is covered
 * by integration testing in Phase 1 production; this is the minimum to
 * guarantee the flag-off fallback path stays safe (returns 404 not 500).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Supabase auth mock — anonymous by default.
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: null } }) },
    }),
}));

// Default: feature flag OFF.
const isEnabledMock = vi.fn<(flag: string, tenant: unknown) => Promise<boolean>>();
vi.mock('@/lib/ai/feature-flags', () => ({
    isAiFeatureEnabled: (flag: string, tenant: unknown) => isEnabledMock(flag, tenant),
}));

// Rate limit always passes in tests.
vi.mock('@/lib/rate-limit', () => ({
    rateLimit: async () => null,
    RATE_LIMITS: {},
}));

import { GET } from '@/app/api/jobs/search/semantic/route';

function makeRequest(query: string): NextRequest {
    return new NextRequest(new URL(`http://localhost/api/jobs/search/semantic?${query}`));
}

beforeEach(() => {
    isEnabledMock.mockReset();
});

describe('GET /api/jobs/search/semantic', () => {
    it('returns 404 when the ai.search.semantic flag is off', async () => {
        isEnabledMock.mockResolvedValue(false);
        const res = await GET(makeRequest('q=PMHNP'));
        expect(res.status).toBe(404);
    });

    it('returns 400 on invalid query (missing q)', async () => {
        isEnabledMock.mockResolvedValue(true);
        const res = await GET(makeRequest(''));
        expect(res.status).toBe(400);
    });

    it('returns 400 on too-short q', async () => {
        isEnabledMock.mockResolvedValue(true);
        const res = await GET(makeRequest('q=a'));
        expect(res.status).toBe(400);
    });
});
