/**
 * Redis-backed response cache for the LLM Gateway.
 *
 * Reuses the existing Upstash Redis instance configured for rate limiting.
 * When Redis is unavailable, cache reads/writes silently no-op so callers
 * still get a fresh response (just without the cost savings).
 *
 * Cache key shape: `ai:cache:v1:<task>:<sha256(...keyParts)>`. Keep the prefix
 * stable — it lets us bump the version (`v2`) to invalidate cleanly when the
 * prompt or output schema changes.
 */

import { createHash } from 'crypto';
import { Redis } from '@upstash/redis';
import { logger } from '../logger';
import type { AiTaskId, CompleteResponse } from './types';

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    : null;

const CACHE_VERSION = 'v1';

function buildCacheKey(task: AiTaskId, parts: readonly unknown[]): string {
    const hash = createHash('sha256')
        .update(parts.map((p) => JSON.stringify(p ?? null)).join('|'))
        .digest('hex');
    return `ai:cache:${CACHE_VERSION}:${task}:${hash}`;
}

/** Stored shape — slim copy of CompleteResponse without the `parsed` field (recomputed on read). */
interface CachedEntry {
    content: string;
    provider: string;
    model: string;
    /** Stored so we can preserve the original token counts in observability without re-billing. */
    storedAt: number;
}

export interface CacheLookupResult<T> {
    hit: boolean;
    response?: CompleteResponse<T>;
}

export async function readCache<T>(
    task: AiTaskId,
    parts: readonly unknown[] | undefined,
): Promise<CacheLookupResult<T>> {
    if (!redis || !parts) return { hit: false };
    try {
        const key = buildCacheKey(task, parts);
        const cached = await redis.get<CachedEntry>(key);
        if (!cached) return { hit: false };

        // Cache hits are free — zero out usage so they don't inflate cost dashboards.
        const response: CompleteResponse<T> = {
            content: cached.content,
            provider: cached.provider as CompleteResponse<T>['provider'],
            model: cached.model,
            usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, costUsd: 0 },
            latencyMs: 0,
            cacheHit: true,
            fallbackUsed: false,
        };
        return { hit: true, response };
    } catch (err) {
        logger.warn('AI cache read failed; serving fresh response', undefined, err);
        return { hit: false };
    }
}

export async function writeCache(
    task: AiTaskId,
    parts: readonly unknown[] | undefined,
    response: Pick<CompleteResponse, 'content' | 'provider' | 'model'>,
    ttlSeconds: number,
): Promise<void> {
    if (!redis || !parts || ttlSeconds <= 0) return;
    try {
        const key = buildCacheKey(task, parts);
        const entry: CachedEntry = {
            content: response.content,
            provider: response.provider,
            model: response.model,
            storedAt: Date.now(),
        };
        await redis.set(key, entry, { ex: ttlSeconds });
    } catch (err) {
        logger.warn('AI cache write failed; continuing', undefined, err);
    }
}

/** Exposed for tests. */
export const __testing = { buildCacheKey };
