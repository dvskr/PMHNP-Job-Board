/**
 * Cross-chunk presence aggregator for Greenhouse + Workday.
 *
 * Sprint 2 introduced source-presence tracking but had to skip chunked
 * sources because each chunk only sees a subset of the catalog — a job
 * missing from chunk 0 might be present in chunk 3, so per-chunk
 * presence checks would falsely strike most jobs as missing.
 *
 * This module solves that. After each chunk completes, it stores the
 * chunk's `external_id` set in Upstash Redis. After the LAST chunk for
 * a given cron cycle completes, it aggregates the union of all chunks
 * and runs the same `recordSourcePresence` logic the non-chunked sources
 * already use.
 *
 * Design:
 *   - Run key buckets per 2-hour window: `presence:<source>:run:<bucket>`
 *     where bucket = floor(now / 2h). All chunks within the same cycle
 *     share a key; the next cycle (6h later) gets a new bucket cleanly.
 *   - Each chunk writes `presence:<source>:run:<bucket>:chunk:<idx>` with
 *     its `external_id`s and fetched count, TTL 12h.
 *   - On every chunk completion, check whether all expected chunk keys
 *     exist for this run. If yes → aggregate + run presence check +
 *     cleanup. If no → wait for the next chunk.
 *   - Late or missing chunks are tolerated by the TTL: if a chunk never
 *     fires, the keys age out and the next cycle starts fresh.
 *
 * Falls back gracefully when Upstash is unavailable (returns
 * `outcome='skipped_no_redis'` and writes nothing).
 */

import { Redis } from '@upstash/redis';
import type { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';
import {
    recordSourcePresence,
    loadHistoricalAvgFetched,
    type PresenceCheckResult,
} from './source-presence';
import type { HealthRecorder } from './recorder';

/** TTL on Redis keys; longer than the 6h gap between cron cycles. */
const KEY_TTL_SECONDS = 12 * 60 * 60;

/** Run bucket = floor(now / 2h). Keeps chunks within one cycle grouped. */
const RUN_BUCKET_MS = 2 * 60 * 60 * 1000;

/** Per-source chunk count — MUST match the cron schedule in vercel.json AND the
 *  source's own chunk total. greenhouse was reduced 8→4 (GREENHOUSE_TOTAL_CHUNKS
 *  in lib/aggregators/greenhouse.ts; vercel.json schedules chunk=0..3), so an 8
 *  here meant countChunksSeen never reached the total and aggregation never
 *  fired — the Redis keys just TTL'd out every cycle. */
export const CHUNKED_SOURCE_TOTAL_CHUNKS: Readonly<Record<string, number>> = {
    greenhouse: 4,
    workday: 5,
};

let redisInstance: Redis | null = null;
function getRedis(): Redis | null {
    if (redisInstance) return redisInstance;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;
    redisInstance = new Redis({ url, token });
    return redisInstance;
}

interface ChunkPayload {
    fetchedExternalIds: string[];
    fetchedCount: number;
    completedAt: number;
}

export type ChunkAggregateOutcome =
    | 'chunk_recorded_waiting_for_more'
    | 'aggregated_and_checked'
    | 'skipped_no_redis'
    | 'skipped_unknown_source';

export interface ChunkAggregateResult {
    outcome: ChunkAggregateOutcome;
    source: string;
    chunkIndex: number;
    totalChunks: number;
    chunksSeen: number;
    /** Set when outcome === 'aggregated_and_checked'. */
    presenceResult: PresenceCheckResult | null;
}

export interface RecordChunkInput {
    prisma: PrismaClient;
    source: string;
    chunkIndex: number;
    fetchedExternalIds: ReadonlyArray<string>;
    fetchedCount: number;
    /** Optional audit recorder. Forwarded to the presence check on aggregate. */
    recorder?: HealthRecorder;
    /** Override Redis (test seam). */
    redis?: Redis | null;
    /** Override now() (test seam). */
    nowMs?: number;
}

export async function recordChunkAndMaybeAggregate(
    input: RecordChunkInput,
): Promise<ChunkAggregateResult> {
    const log = logger.withContext({ component: 'chunked-presence', source: input.source });

    const totalChunks = CHUNKED_SOURCE_TOTAL_CHUNKS[input.source];
    if (!totalChunks) {
        log.warn('Unknown chunked source — skipping aggregation', { source: input.source });
        return baseResult(input, 'skipped_unknown_source', 0, totalChunks ?? 0, null);
    }

    const redis = input.redis ?? getRedis();
    if (!redis) {
        log.warn('UPSTASH_REDIS_REST_URL/TOKEN not set — chunked aggregation skipped');
        return baseResult(input, 'skipped_no_redis', 0, totalChunks, null);
    }

    const now = input.nowMs ?? Date.now();
    const runKey = buildRunKey(input.source, now);

    // 1. Record this chunk's payload.
    const chunkKey = `${runKey}:chunk:${input.chunkIndex}`;
    const payload: ChunkPayload = {
        fetchedExternalIds: Array.from(input.fetchedExternalIds),
        fetchedCount: input.fetchedCount,
        completedAt: now,
    };
    await redis.set(chunkKey, JSON.stringify(payload), { ex: KEY_TTL_SECONDS });

    // 2. Check completion of all expected chunks for this run.
    const seenChunks = await countChunksSeen(redis, runKey, totalChunks);
    if (seenChunks < totalChunks) {
        log.info('Chunk recorded; waiting for more', {
            chunkIndex: input.chunkIndex,
            seen: seenChunks,
            total: totalChunks,
        });
        return baseResult(input, 'chunk_recorded_waiting_for_more', seenChunks, totalChunks, null);
    }

    // 3. All chunks complete — aggregate.
    log.info('All chunks complete — aggregating', { totalChunks });
    const { unionIds, totalFetched } = await collectAllChunks(redis, runKey, totalChunks);

    // 4. Run presence check against the aggregated set.
    const baseline = await loadHistoricalAvgFetched(input.prisma, input.source);
    const presenceResult = await recordSourcePresence(input.prisma, {
        source: input.source,
        fetchedExternalIds: Array.from(unionIds),
        fetchedCount: totalFetched,
        historicalAvgFetched: baseline,
        recorder: input.recorder,
    });

    // 5. Cleanup the run keys best-effort (TTL would handle this anyway).
    try {
        await cleanupRun(redis, runKey, totalChunks);
    } catch (err: unknown) {
        log.warn('Cleanup of chunk keys failed (non-fatal)', { err: errMessage(err) });
    }

    return baseResult(input, 'aggregated_and_checked', totalChunks, totalChunks, presenceResult);
}

/** Public so tests can assert key shape. */
export function buildRunKey(source: string, nowMs: number): string {
    const bucket = Math.floor(nowMs / RUN_BUCKET_MS);
    return `presence:${source}:run:${bucket}`;
}

async function countChunksSeen(redis: Redis, runKey: string, total: number): Promise<number> {
    let seen = 0;
    for (let i = 0; i < total; i++) {
        const exists = await redis.exists(`${runKey}:chunk:${i}`);
        if (exists) seen++;
    }
    return seen;
}

async function collectAllChunks(
    redis: Redis,
    runKey: string,
    total: number,
): Promise<{ unionIds: Set<string>; totalFetched: number }> {
    const union = new Set<string>();
    let totalFetched = 0;
    for (let i = 0; i < total; i++) {
        const raw = await redis.get<string | ChunkPayload | null>(`${runKey}:chunk:${i}`);
        if (!raw) continue;
        const payload: ChunkPayload = typeof raw === 'string' ? JSON.parse(raw) as ChunkPayload : raw;
        for (const id of payload.fetchedExternalIds) union.add(id);
        totalFetched += payload.fetchedCount;
    }
    return { unionIds: union, totalFetched };
}

async function cleanupRun(redis: Redis, runKey: string, total: number): Promise<void> {
    const keys: string[] = [];
    for (let i = 0; i < total; i++) keys.push(`${runKey}:chunk:${i}`);
    if (keys.length > 0) await redis.del(...keys);
}

function baseResult(
    input: RecordChunkInput,
    outcome: ChunkAggregateOutcome,
    chunksSeen: number,
    totalChunks: number,
    presenceResult: PresenceCheckResult | null,
): ChunkAggregateResult {
    return {
        outcome,
        source: input.source,
        chunkIndex: input.chunkIndex,
        totalChunks,
        chunksSeen,
        presenceResult,
    };
}

function errMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
}
