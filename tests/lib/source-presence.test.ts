import { describe, it, expect, vi } from 'vitest';
import {
    computePresenceDiff,
    recordSourcePresence,
    PRESENCE_CHECKER_VERSION,
} from '../../lib/health/source-presence';

describe('computePresenceDiff', () => {
    it('returns empty when both sets are empty', () => {
        expect(computePresenceDiff([], [])).toEqual({ seenAgain: [], missing: [] });
    });

    it('partitions seen-again vs missing', () => {
        expect(computePresenceDiff(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual({
            seenAgain: ['b', 'c'],
            missing: ['a'],
        });
    });

    it('handles all-seen', () => {
        expect(computePresenceDiff(['a', 'b'], ['a', 'b', 'c'])).toEqual({
            seenAgain: ['a', 'b'],
            missing: [],
        });
    });

    it('handles all-missing', () => {
        expect(computePresenceDiff(['a', 'b'], ['c', 'd'])).toEqual({
            seenAgain: [],
            missing: ['a', 'b'],
        });
    });
});

interface FakeJobRow { id: string; externalId: string }

function fakePrisma(opts: {
    publishedJobs?: FakeJobRow[];
    findManyMock?: ReturnType<typeof vi.fn>;
    updateManyMock?: ReturnType<typeof vi.fn>;
} = {}) {
    const findMany = opts.findManyMock ?? vi.fn().mockResolvedValue(opts.publishedJobs ?? []);
    const updateMany = opts.updateManyMock ?? vi.fn().mockResolvedValue({ count: 0 });
    return {
        prisma: {
            job: { findMany, updateMany },
        } as unknown as Parameters<typeof recordSourcePresence>[0],
        findMany,
        updateMany,
    };
}

describe('recordSourcePresence', () => {
    it('skips when fetchedCount is zero', async () => {
        const { prisma, findMany } = fakePrisma();
        const r = await recordSourcePresence(prisma, {
            source: 'jooble',
            fetchedExternalIds: [],
            fetchedCount: 0,
            historicalAvgFetched: 1500,
        });
        expect(r.outcome).toBe('skipped_zero_fetched');
        expect(findMany).not.toHaveBeenCalled();
    });

    it('skips when no historical baseline', async () => {
        const { prisma } = fakePrisma();
        const r = await recordSourcePresence(prisma, {
            source: 'newsource',
            fetchedExternalIds: ['a', 'b'],
            fetchedCount: 2,
            historicalAvgFetched: 0,
        });
        expect(r.outcome).toBe('skipped_no_baseline');
    });

    it('skips when fetched count is below partial-fetch threshold', async () => {
        const { prisma } = fakePrisma();
        const r = await recordSourcePresence(prisma, {
            source: 'jooble',
            fetchedExternalIds: ['a'],
            fetchedCount: 100,
            historicalAvgFetched: 1500, // 0.5 * 1500 = 750 required
        });
        expect(r.outcome).toBe('skipped_partial_fetch');
        expect(r.skippedReason).toMatch(/required=750/);
    });

    it('completes and resets seen-again jobs', async () => {
        const { prisma, findMany, updateMany } = fakePrisma({
            publishedJobs: [
                { id: 'j1', externalId: 'a' },
                { id: 'j2', externalId: 'b' },
            ],
        });
        const r = await recordSourcePresence(prisma, {
            source: 'jooble',
            fetchedExternalIds: ['a', 'b'],
            fetchedCount: 1500,
            historicalAvgFetched: 1500,
        });
        expect(r.outcome).toBe('completed');
        expect(r.seenAgain).toBe(2);
        expect(r.missingThisRun).toBe(0);
        expect(r.updatesIssued).toBe(2);
        expect(findMany).toHaveBeenCalledOnce();
        expect(updateMany).toHaveBeenCalledOnce();
        const updateCall = updateMany.mock.calls[0][0];
        expect(updateCall.data).toMatchObject({ healthConsecutiveMissing: 0 });
        expect(updateCall.data.healthLastSeenAt).toBeInstanceOf(Date);
    });

    it('completes and increments missing jobs', async () => {
        const { prisma, updateMany } = fakePrisma({
            publishedJobs: [
                { id: 'j1', externalId: 'a' },
                { id: 'j2', externalId: 'b' },
                { id: 'j3', externalId: 'c' },
            ],
        });
        const r = await recordSourcePresence(prisma, {
            source: 'jooble',
            fetchedExternalIds: ['a'], // b and c missing
            fetchedCount: 1500,
            historicalAvgFetched: 1500,
        });
        expect(r.outcome).toBe('completed');
        expect(r.seenAgain).toBe(1);
        expect(r.missingThisRun).toBe(2);
        expect(r.updatesIssued).toBe(3); // 1 reset + 2 increments
        expect(updateMany).toHaveBeenCalledTimes(2);
        // Increment call (second)
        const incCall = updateMany.mock.calls[1][0];
        expect(incCall.data).toMatchObject({ healthConsecutiveMissing: { increment: 1 } });
    });

    it('respects maxUpdates cap', async () => {
        const published = Array.from({ length: 100 }, (_, i) => ({
            id: `j${i}`,
            externalId: `e${i}`,
        }));
        const { prisma, updateMany } = fakePrisma({ publishedJobs: published });
        const r = await recordSourcePresence(prisma, {
            source: 'jooble',
            fetchedExternalIds: [], // all 100 missing
            fetchedCount: 1500,
            historicalAvgFetched: 1500,
            maxUpdates: 25,
        });
        expect(r.updatesIssued).toBe(25);
        expect(updateMany).toHaveBeenCalledOnce();
        const ids = updateMany.mock.calls[0][0].where.id.in;
        expect(ids).toHaveLength(25);
    });

    it('records the checker version on every result', async () => {
        const { prisma } = fakePrisma();
        const r = await recordSourcePresence(prisma, {
            source: 'jooble',
            fetchedExternalIds: [],
            fetchedCount: 0,
            historicalAvgFetched: 1500,
        });
        expect(r.checkerVersion).toBe(PRESENCE_CHECKER_VERSION);
    });
});
