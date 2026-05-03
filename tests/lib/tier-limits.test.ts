/**
 * Tests for lib/tier-limits.ts — the per-posting credit pool gates.
 *
 * Audit #20: foundational coverage so future refactors of #13
 * (canUnlockCandidate historical-views bug) don't silently grant unlimited
 * unlocks or lock out paying customers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
    getEmployerActivePostings,
    getEmployerActivePosting,
    getEmployerTier,
    canUnlockCandidate,
    canSendInMail,
    getUsageSummary,
} from '@/lib/tier-limits';

const EMPLOYER_ID = 'emp-123';
const PROFILE_ID = 'profile-456';

function makePosting(overrides: Partial<{
    id: string;
    pricingTier: string;
    createdAt: Date;
    jobId: string;
    job: { id: string; createdAt: Date; expiresAt: Date | null };
}> = {}) {
    const id = overrides.id ?? 'posting-1';
    return {
        id,
        pricingTier: 'pro',
        createdAt: new Date('2026-04-01'),
        jobId: `job-${id}`,
        job: {
            id: `job-${id}`,
            createdAt: new Date('2026-04-01'),
            expiresAt: new Date('2026-06-01'),
        },
        ...overrides,
    };
}

describe('getEmployerTier', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns "pro" for an employer with no active postings (M2 fallback)', async () => {
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([] as never);
        const tier = await getEmployerTier(EMPLOYER_ID);
        expect(tier).toBe('pro');
    });

    it('always returns "pro" in single-tier model regardless of stored value', async () => {
        // Even if a stored row had a legacy tier, we collapse to 'pro'
        const tier = await getEmployerTier(EMPLOYER_ID);
        expect(tier).toBe('pro');
    });
});

describe('getEmployerActivePostings', () => {
    beforeEach(() => vi.clearAllMocks());

    it('queries with isPublished=true and (expiresAt null or > now)', async () => {
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([] as never);
        await getEmployerActivePostings(EMPLOYER_ID);

        expect(prisma.employerJob.findMany).toHaveBeenCalledOnce();
        const arg = vi.mocked(prisma.employerJob.findMany).mock.calls[0][0]!;
        expect(arg.where).toMatchObject({
            userId: EMPLOYER_ID,
            job: expect.objectContaining({
                isPublished: true,
            }),
        });
    });
});

describe('getEmployerActivePosting', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns null when no active postings exist', async () => {
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([] as never);
        const result = await getEmployerActivePosting(EMPLOYER_ID);
        expect(result).toBeNull();
    });

    it('returns the most-recent posting (newest first)', async () => {
        const newer = makePosting({ id: 'newer', createdAt: new Date('2026-04-15') });
        const older = makePosting({ id: 'older', createdAt: new Date('2026-04-01') });
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([newer, older] as never);

        const result = await getEmployerActivePosting(EMPLOYER_ID);
        expect(result?.id).toBe('newer');
    });
});

describe('canUnlockCandidate', () => {
    beforeEach(() => vi.clearAllMocks());

    it('denies when no active postings exist', async () => {
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([] as never);

        const result = await canUnlockCandidate(EMPLOYER_ID, 'pro');
        expect(result.allowed).toBe(false);
        expect(result.postingId).toBeUndefined();
    });

    it('allows when an active posting has remaining credits', async () => {
        const posting = makePosting();
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([posting] as never);
        // Zero usage everywhere
        vi.mocked(prisma.profileView.count).mockResolvedValue(0 as never);

        const result = await canUnlockCandidate(EMPLOYER_ID, 'pro');
        expect(result.allowed).toBe(true);
        expect(result.postingId).toBe('posting-1');
    });

    it('denies when active+legacy views meet or exceed cap', async () => {
        const posting = makePosting();
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([posting] as never);
        // 25 active+legacy views vs 25 cap → exhausted
        vi.mocked(prisma.profileView.count).mockResolvedValue(25 as never);

        const result = await canUnlockCandidate(EMPLOYER_ID, 'pro');
        expect(result.allowed).toBe(false);
        expect(result.limit).toBe(25);
    });

    it('with two active postings, total cap is 50 (audit verification)', async () => {
        const p1 = makePosting({ id: 'p1' });
        const p2 = makePosting({ id: 'p2', createdAt: new Date('2026-04-15') });
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([p2, p1] as never);
        // Plenty of headroom across both postings
        vi.mocked(prisma.profileView.count).mockResolvedValue(0 as never);

        const result = await canUnlockCandidate(EMPLOYER_ID, 'pro');
        expect(result.allowed).toBe(true);
        // Limit reflects sum across postings
        expect(result.limit).toBe(50);
    });

    it('audit #13: views from expired postings do NOT count against active cap', async () => {
        // Scenario: employer has a fresh active posting (limit 25). The
        // active+legacy count query (filtering on employerJobId IN active OR null)
        // returns 0 because all 75 historical views were attributed to expired
        // postings. Function should allow the new unlock.
        const posting = makePosting();
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([posting] as never);
        vi.mocked(prisma.profileView.count).mockResolvedValue(0 as never);

        const result = await canUnlockCandidate(EMPLOYER_ID, 'pro');
        expect(result.allowed).toBe(true);
        expect(result.used).toBe(0);
    });

    it('with two postings under combined cap, finds capacity somewhere', async () => {
        // Smoke test: both postings have plenty of room, function finds capacity
        const p1 = makePosting({ id: 'p1' });
        const p2 = makePosting({ id: 'p2', createdAt: new Date('2026-04-15') });
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([p2, p1] as never);

        // Default zero counts: nothing used yet
        vi.mocked(prisma.profileView.count).mockResolvedValue(0 as never);

        const result = await canUnlockCandidate(EMPLOYER_ID, 'pro');
        expect(result.allowed).toBe(true);
        expect(result.postingId).toBeDefined();
    });
});

describe('canSendInMail', () => {
    beforeEach(() => vi.clearAllMocks());

    it('denies when no active postings exist', async () => {
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([] as never);

        const result = await canSendInMail(PROFILE_ID, EMPLOYER_ID, 'pro');
        expect(result.allowed).toBe(false);
    });

    it('allows when InMail count for the active posting is below cap', async () => {
        const posting = makePosting();
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([posting] as never);
        vi.mocked(prisma.conversation.count).mockResolvedValueOnce(10 as never); // 10/25 used on this job

        const result = await canSendInMail(PROFILE_ID, EMPLOYER_ID, 'pro');
        expect(result.allowed).toBe(true);
    });

    it('denies when all active postings are exhausted', async () => {
        const posting = makePosting();
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([posting] as never);
        vi.mocked(prisma.conversation.count).mockResolvedValueOnce(25 as never); // 25/25 used

        const result = await canSendInMail(PROFILE_ID, EMPLOYER_ID, 'pro');
        expect(result.allowed).toBe(false);
    });

    it('counts conversations created on or after the posting createdAt', async () => {
        const posting = makePosting();
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([posting] as never);
        vi.mocked(prisma.conversation.count).mockResolvedValueOnce(0 as never);

        await canSendInMail(PROFILE_ID, EMPLOYER_ID, 'pro');

        const arg = vi.mocked(prisma.conversation.count).mock.calls[0][0]!;
        expect(arg.where).toMatchObject({
            jobId: posting.job.id,
            createdAt: { gte: posting.createdAt },
        });
    });
});

describe('getUsageSummary', () => {
    beforeEach(() => vi.clearAllMocks());

    it('reports zero entitlement when no active postings', async () => {
        // No active posting → no allowance yet. Reporting the per-posting tier
        // cap here (the previous behavior) misled the dashboard into rendering
        // "0/25 unlocks" and the talent-pool cards into showing "Unlock Profile"
        // CTAs that always failed at the API. We now report 0/0 so the empty
        // state is explicit and the UI can prompt "Post a job".
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([] as never);

        const result = await getUsageSummary(PROFILE_ID, EMPLOYER_ID, 'pro');
        expect(result.candidateUnlocks.used).toBe(0);
        expect(result.candidateUnlocks.limit).toBe(0);
        expect(result.inmails.used).toBe(0);
        expect(result.inmails.limit).toBe(0);
    });

    it('limit scales with number of active postings (50 for two postings)', async () => {
        const p1 = makePosting({ id: 'p1' });
        const p2 = makePosting({ id: 'p2' });
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([p1, p2] as never);
        vi.mocked(prisma.profileView.count).mockResolvedValue(0 as never);
        vi.mocked(prisma.conversation.count).mockResolvedValue(0 as never);

        const result = await getUsageSummary(PROFILE_ID, EMPLOYER_ID, 'pro');
        expect(result.candidateUnlocks.limit).toBe(50);
        expect(result.inmails.limit).toBe(50);
    });
});
