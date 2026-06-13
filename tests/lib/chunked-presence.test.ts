import { describe, it, expect, vi } from 'vitest';
import {
    recordChunkAndMaybeAggregate,
    buildRunKey,
    CHUNKED_SOURCE_TOTAL_CHUNKS,
} from '../../lib/health/chunked-presence';

type FakeRedis = Parameters<typeof recordChunkAndMaybeAggregate>[0]['redis'];

function fakeRedis(initial: Map<string, string> = new Map()) {
    const store = initial;
    const calls: { method: string; args: unknown[] }[] = [];
    const obj = {
        async set(key: string, value: string, _opts?: unknown): Promise<'OK'> {
            calls.push({ method: 'set', args: [key, value, _opts] });
            store.set(key, value);
            return 'OK';
        },
        async exists(key: string): Promise<number> {
            calls.push({ method: 'exists', args: [key] });
            return store.has(key) ? 1 : 0;
        },
        async get<T = unknown>(key: string): Promise<T | null> {
            calls.push({ method: 'get', args: [key] });
            const v = store.get(key);
            return v === undefined ? null : (v as unknown as T);
        },
        async del(...keys: string[]): Promise<number> {
            calls.push({ method: 'del', args: keys });
            let n = 0;
            for (const k of keys) if (store.delete(k)) n++;
            return n;
        },
    } as unknown as FakeRedis;
    return { redis: obj, store, calls };
}

function fakePrisma() {
    const findMany = vi.fn().mockResolvedValue([]);
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const queryRaw = vi.fn().mockResolvedValue([{ avg: 1500 }]);
    return {
        prisma: {
            job: { findMany, findFirst: vi.fn().mockResolvedValue(null), updateMany },
            $queryRaw: queryRaw,
        } as unknown as Parameters<typeof recordChunkAndMaybeAggregate>[0]['prisma'],
        findMany,
        updateMany,
        queryRaw,
    };
}

describe('buildRunKey', () => {
    it('produces deterministic 2-hour buckets', () => {
        const t1 = new Date('2026-04-29T10:15:00Z').getTime();
        const t2 = new Date('2026-04-29T10:45:00Z').getTime();
        const t3 = new Date('2026-04-29T16:15:00Z').getTime();
        // Same source + same 2h window → same key
        expect(buildRunKey('greenhouse', t1)).toBe(buildRunKey('greenhouse', t2));
        // Different cycle (6h later) → different key
        expect(buildRunKey('greenhouse', t1)).not.toBe(buildRunKey('greenhouse', t3));
        // Different source → different key
        expect(buildRunKey('greenhouse', t1)).not.toBe(buildRunKey('workday', t1));
    });

    it('embeds the source name in the key', () => {
        expect(buildRunKey('greenhouse', Date.now())).toContain('greenhouse');
    });
});

describe('recordChunkAndMaybeAggregate', () => {
    it('returns skipped_no_redis when Redis is unavailable', async () => {
        const { prisma } = fakePrisma();
        const r = await recordChunkAndMaybeAggregate({
            prisma,
            source: 'greenhouse',
            chunkIndex: 0,
            fetchedExternalIds: ['a', 'b'],
            fetchedCount: 2,
            redis: null,
        });
        expect(r.outcome).toBe('skipped_no_redis');
        expect(r.totalChunks).toBe(CHUNKED_SOURCE_TOTAL_CHUNKS.greenhouse);
    });

    it('returns skipped_unknown_source for non-chunked sources', async () => {
        const { prisma } = fakePrisma();
        const { redis } = fakeRedis();
        const r = await recordChunkAndMaybeAggregate({
            prisma,
            source: 'jooble', // not chunked
            chunkIndex: 0,
            fetchedExternalIds: ['a'],
            fetchedCount: 1,
            redis,
        });
        expect(r.outcome).toBe('skipped_unknown_source');
    });

    it('records a chunk and waits when not all have arrived', async () => {
        const { prisma } = fakePrisma();
        const { redis, calls } = fakeRedis();
        const r = await recordChunkAndMaybeAggregate({
            prisma,
            source: 'greenhouse',
            chunkIndex: 0,
            fetchedExternalIds: ['a', 'b'],
            fetchedCount: 2,
            redis,
            nowMs: new Date('2026-04-29T10:15:00Z').getTime(),
        });
        expect(r.outcome).toBe('chunk_recorded_waiting_for_more');
        expect(r.chunksSeen).toBe(1);
        expect(r.totalChunks).toBe(4); // greenhouse (4 chunks scheduled in vercel.json)
        expect(r.presenceResult).toBeNull();
        // Wrote one chunk key
        expect(calls.some((c) => c.method === 'set')).toBe(true);
    });

    it('aggregates and runs presence check when all chunks arrive', async () => {
        const { prisma, queryRaw } = fakePrisma();
        // workday has 5 chunks. Pre-populate 4 chunks so this call (chunk 4) closes the cycle.
        const initial = new Map<string, string>();
        const now = new Date('2026-04-29T11:30:00Z').getTime();
        const runKey = buildRunKey('workday', now);
        for (let i = 0; i < 4; i++) {
            initial.set(
                `${runKey}:chunk:${i}`,
                JSON.stringify({
                    fetchedExternalIds: [`id-${i}-a`, `id-${i}-b`],
                    fetchedCount: 2,
                    completedAt: now,
                }),
            );
        }
        const { redis } = fakeRedis(initial);

        const r = await recordChunkAndMaybeAggregate({
            prisma,
            source: 'workday',
            chunkIndex: 4,
            fetchedExternalIds: ['id-4-a', 'id-4-b'],
            fetchedCount: 2,
            redis,
            nowMs: now,
        });

        expect(r.outcome).toBe('aggregated_and_checked');
        expect(r.chunksSeen).toBe(5);
        expect(r.totalChunks).toBe(5);
        expect(r.presenceResult).not.toBeNull();
        // Presence check should have been invoked → loadHistoricalAvgFetched
        // does a $queryRaw call.
        expect(queryRaw).toHaveBeenCalled();
    });
});
