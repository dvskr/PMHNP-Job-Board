/**
 * The `?jobId=` filter on the employer surfaces NARROWS the caller's own
 * postings. It must never replace them.
 *
 * Found 2026-09-02 by the edge-to-edge hunt and reproduced live: an employer
 * whose own postings had no applicants passed another employer's job id and
 * received that posting's applicant in full (name, headline, bio, education,
 * work history, licenses, cover letter, screening answers, the owning
 * employer's private notes, and a freshly minted signed resume URL). The
 * analytics route had the identical shape, leaking a rival's view/click series.
 *
 * Both routes now answer 403 for an id outside the caller's owned set. The UI
 * only ever sends an id from the `jobs` array the same endpoint returned, so a
 * foreign id is always a bug or an attack.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const OWNER_ID = 'supabase-employer-fic-1';
const OWNED_JOB = 'job-owned-fic-1';
const FOREIGN_JOB = 'job-owned-by-someone-else-fic-9';

interface MockUser { id: string; email: string }
let mockUser: MockUser | null = null;
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: mockUser }, error: null }) },
    }),
}));

vi.mock('@/lib/rate-limit', () => ({
    rateLimit: async () => null,
    RATE_LIMITS: { employer: { limit: 100, windowSeconds: 60 } },
}));

vi.mock('@/lib/tier-limits', () => ({
    getEmployerTier: async () => 'pro',
    getEmployerActivePostings: async () => [{ id: OWNED_JOB }],
}));

vi.mock('@/lib/resume-storage', () => ({
    mintResumeReadUrl: async () => 'https://storage.example/signed-fic',
    extractRequestContext: () => ({ ip: '127.0.0.1', userAgent: 'vitest' }),
}));

const profileFindUnique = vi.fn();
const employerJobFindMany = vi.fn();
const applicationFindMany = vi.fn();
const analyticsFindMany = vi.fn();
vi.mock('@/lib/prisma', () => ({
    prisma: {
        userProfile: { findUnique: (...a: unknown[]) => profileFindUnique(...a) },
        employerJob: { findMany: (...a: unknown[]) => employerJobFindMany(...a) },
        jobApplication: { findMany: (...a: unknown[]) => applicationFindMany(...a) },
        applyClick: { findMany: (...a: unknown[]) => analyticsFindMany(...a) },
    },
}));

import { GET as getApplicants } from '@/app/api/employer/applicants/route';
import { GET as getAnalytics } from '@/app/api/employer/analytics/route';

function request(path: string): NextRequest {
    return new NextRequest(`http://localhost${path}`);
}

beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: OWNER_ID, email: 'employer@examplepsych.example' };
    profileFindUnique.mockResolvedValue({ role: 'employer' });
    employerJobFindMany.mockResolvedValue([
        { jobId: OWNED_JOB, job: { id: OWNED_JOB, title: 'PMHNP Outpatient (Fixture)', viewCount: 3, applyClickCount: 1 } },
    ]);
    applicationFindMany.mockResolvedValue([]);
    analyticsFindMany.mockResolvedValue([]);
});

describe('GET /api/employer/applicants jobId scoping', () => {
    it('refuses a jobId the caller does not own', async () => {
        const res = await getApplicants(request(`/api/employer/applicants?jobId=${FOREIGN_JOB}`));

        expect(res.status).toBe(403);
        // The database must never be asked for the foreign posting's applicants.
        expect(applicationFindMany).not.toHaveBeenCalled();
    });

    it('allows a jobId the caller owns and scopes the query to it', async () => {
        const res = await getApplicants(request(`/api/employer/applicants?jobId=${OWNED_JOB}`));

        expect(res.status).toBe(200);
        const where = applicationFindMany.mock.calls[0][0].where;
        expect(where.jobId).toEqual({ in: [OWNED_JOB] });
    });

    it('scopes to every owned posting when no filter is given', async () => {
        const res = await getApplicants(request('/api/employer/applicants'));

        expect(res.status).toBe(200);
        const where = applicationFindMany.mock.calls[0][0].where;
        expect(where.jobId).toEqual({ in: [OWNED_JOB] });
    });
});

describe('GET /api/employer/analytics jobId scoping', () => {
    it('refuses a jobId the caller does not own', async () => {
        const res = await getAnalytics(request(`/api/employer/analytics?jobId=${FOREIGN_JOB}&days=30`));

        expect(res.status).toBe(403);
        expect(analyticsFindMany).not.toHaveBeenCalled();
    });

    it('allows a jobId the caller owns', async () => {
        const res = await getAnalytics(request(`/api/employer/analytics?jobId=${OWNED_JOB}&days=30`));

        expect(res.status).toBe(200);
    });
});
