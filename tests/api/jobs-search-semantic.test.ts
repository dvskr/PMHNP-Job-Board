/**
 * Smoke tests for /api/jobs/search/semantic.
 *
 * Two test groups:
 *
 *   1. Defensive branches — flag-off, missing query, too-short q. These
 *      lock 4xx error paths so the route doesn't accidentally start
 *      returning 500s on input it should reject cleanly.
 *
 *   2. Chaos / fallback (Sprint 1.1.7) — when the LLM gateway throws
 *      mid-request (provider outage, rate limit, schema validation
 *      failure), the route must STILL return a result envelope with
 *      `degraded: true, mode: 'keyword'` and surface keyword-only hits.
 *      A regression here would silently degrade the user experience
 *      from "search worked but in keyword mode" to "search returned
 *      nothing / 500'd."
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AiGatewayError } from '@/lib/ai/gateway';

// Supabase auth mock — anonymous by default.
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: null } }) },
    }),
}));

// next/headers cookies() — Sprint 1.1.6 added cookie-based anon-tenant
// stickiness for the experiment harness; the route now reads + writes a
// cookie when the caller is signed-out. Provide an in-memory stub.
vi.mock('next/headers', () => {
    const store = new Map<string, string>();
    return {
        cookies: async () => ({
            get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
            set: (name: string, value: string) => { store.set(name, value); },
        }),
    };
});

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

// Gateway mocks — embed/complete are the LLM call surface. Embed throwing
// is the chaos trigger we use to exercise the keyword-fallback path.
const embedMock = vi.fn();
vi.mock('@/lib/ai/gateway', async (importActual) => {
    const actual = await importActual<typeof import('@/lib/ai/gateway')>();
    return {
        ...actual,
        embed: (...args: unknown[]) => embedMock(...args),
    };
});

// Vector search mock — bypassed when chaos kicks the embed call out.
const semanticJobSearchMock = vi.fn();
vi.mock('@/lib/ai/vector-search', async (importActual) => {
    const actual = await importActual<typeof import('@/lib/ai/vector-search')>();
    return {
        ...actual,
        semanticJobSearch: (...args: unknown[]) => semanticJobSearchMock(...args),
    };
});

// Experiment harness mocks — sticky arm + impression tracking are
// orthogonal to the chaos test so we just stub them as no-ops.
vi.mock('@/lib/ai/experiments', () => ({
    getExperimentArm: async () => 'treatment',
    trackExperimentEvent: async () => undefined,
}));

// Prisma mock — the route hits prisma.job.findMany twice (keyword pass +
// hydrate pass). Both go through this single mock; fixture rows match
// the fields the route SELECTs.
const jobFindManyMock = vi.fn();
vi.mock('@/lib/prisma', () => ({
    prisma: {
        job: { findMany: (...args: unknown[]) => jobFindManyMock(...args) },
    },
}));

import { GET } from '@/app/api/jobs/search/semantic/route';

function makeRequest(query: string): NextRequest {
    return new NextRequest(new URL(`http://localhost/api/jobs/search/semantic?${query}`));
}

/** Fixture matching the SELECT shape the route uses for hydration. */
function jobRow(id: string, title: string, state = 'CA') {
    return {
        id, title, slug: `${id}-slug`, employer: 'Acme Health', location: 'Remote',
        jobType: 'full_time', mode: 'remote', experienceLevel: 'mid',
        description: 'desc', descriptionSummary: 'summary',
        salaryRange: '$130k-$170k', minSalary: 130000, maxSalary: 170000, salaryPeriod: 'year',
        normalizedMinSalary: 130000, normalizedMaxSalary: 170000,
        salaryIsEstimated: false, salaryConfidence: 1, displaySalary: '$130k-$170k',
        city: 'Anywhere', state: 'California', stateCode: state, country: 'US',
        isRemote: true, isHybrid: false,
        applyLink: 'https://noop.test/apply', applyOnPlatform: false,
        isFeatured: false, isPublished: true, isVerifiedEmployer: true,
        sourceType: 'employer', sourceProvider: null, sourceSite: null, externalId: null,
        originalPostedAt: new Date(), viewCount: 0, applyClickCount: 0,
        createdAt: new Date(), updatedAt: new Date(), expiresAt: null, companyId: null,
        employerJobs: { companyLogoUrl: null },
    };
}

beforeEach(() => {
    isEnabledMock.mockReset();
    embedMock.mockReset();
    semanticJobSearchMock.mockReset();
    jobFindManyMock.mockReset();
});

describe('GET /api/jobs/search/semantic — defensive branches', () => {
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

describe('GET /api/jobs/search/semantic — chaos / keyword fallback (Sprint 1.1.7)', () => {
    it('returns degraded=true + mode=keyword + keyword hits when the gateway throws AiGatewayError', async () => {
        isEnabledMock.mockResolvedValue(true);
        // Chaos: embed call rejects mid-flight (e.g. provider outage).
        embedMock.mockRejectedValue(new AiGatewayError('all_providers_failed', 'all_providers_failed'));
        // Keyword fallback finds 2 jobs by ILIKE on tokenized query.
        const keywordRows = [
            { id: 'job-1' },
            { id: 'job-2' },
        ];
        const hydratedRows = [
            jobRow('job-1', 'Telehealth PMHNP — Adult Mood'),
            jobRow('job-2', 'PMHNP — Mood and Anxiety Outpatient'),
        ];
        // First call is the keyword filter (returns ID list); second is the hydrate.
        jobFindManyMock
            .mockResolvedValueOnce(keywordRows)
            .mockResolvedValueOnce(hydratedRows);

        const res = await GET(makeRequest('q=experienced telehealth PMHNP'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.degraded).toBe(true);
        expect(body.mode).toBe('keyword');
        expect(body.jobs).toHaveLength(2);
        expect(body.jobs.map((j: { id: string }) => j.id)).toEqual(['job-1', 'job-2']);
        // Vector search should never have been called — embed threw before it could.
        expect(semanticJobSearchMock).not.toHaveBeenCalled();
    });

    it('returns degraded=true even when the gateway throws a generic non-AiGatewayError', async () => {
        // Network error / unexpected exception — must still degrade gracefully.
        isEnabledMock.mockResolvedValue(true);
        embedMock.mockRejectedValue(new Error('ECONNRESET upstream'));
        jobFindManyMock
            .mockResolvedValueOnce([{ id: 'job-1' }])
            .mockResolvedValueOnce([jobRow('job-1', 'PMHNP Outpatient')]);

        const res = await GET(makeRequest('q=PMHNP outpatient'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.degraded).toBe(true);
        expect(body.mode).toBe('keyword');
        expect(body.jobs).toHaveLength(1);
    });

    it('returns degraded=true with empty jobs[] when neither vector NOR keyword finds anything', async () => {
        // Worst case: gateway down AND keyword search returns nothing.
        // Route should still respond cleanly (not 500), with empty results
        // and degraded flag so the UI can show "no matches" gracefully.
        isEnabledMock.mockResolvedValue(true);
        embedMock.mockRejectedValue(new AiGatewayError('timeout', 'timeout'));
        jobFindManyMock.mockResolvedValueOnce([]); // no keyword hits

        const res = await GET(makeRequest('q=highly specific niche role'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.degraded).toBe(true);
        expect(body.mode).toBe('keyword');
        expect(body.jobs).toEqual([]);
    });
});
