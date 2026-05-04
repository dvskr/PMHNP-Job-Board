/**
 * Per-tenant + per-task rate limiting for AI calls.
 *
 * Built on the same @upstash/ratelimit primitive as lib/rate-limit.ts but with
 * a separate key prefix so AI quotas don't share a window with HTTP request
 * quotas. Limits are intentionally generous in this phase — tighten when
 * Sprint 0.4 cost dashboards reveal actual usage shapes.
 *
 * Cache hits do NOT consume the rate-limit budget — only real provider calls.
 */

import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { logger } from '../logger';
import type { AiTaskId, AiTenant } from './types';

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    : null;

export interface AiRateLimit {
    /** Max calls per tenant in the window. */
    limit: number;
    /** Window in seconds. */
    windowSeconds: number;
}

export interface RateLimitResult {
    success: boolean;
    remaining: number;
    /** Unix-ms timestamp when the window resets. */
    reset: number;
}

/**
 * In-memory fallback for dev / when Redis isn't configured. Loses state on
 * restart — that's fine: dev usage is low, and we surface a warning so it
 * doesn't silently mask production misconfig.
 */
interface MemoryEntry { count: number; reset: number }
const memory = new Map<string, MemoryEntry>();
let warnedNoRedis = false;

function memoryCheck(key: string, limit: AiRateLimit): RateLimitResult {
    const now = Date.now();
    const entry = memory.get(key);
    if (!entry || now > entry.reset) {
        memory.set(key, { count: 1, reset: now + limit.windowSeconds * 1000 });
        return { success: true, remaining: limit.limit - 1, reset: now + limit.windowSeconds * 1000 };
    }
    if (entry.count >= limit.limit) {
        return { success: false, remaining: 0, reset: entry.reset };
    }
    entry.count += 1;
    return { success: true, remaining: limit.limit - entry.count, reset: entry.reset };
}

export async function checkAiRateLimit(
    task: AiTaskId,
    tenant: AiTenant,
    limit: AiRateLimit,
): Promise<RateLimitResult> {
    const key = `ai:rl:${task}:${tenant.type}:${tenant.id}`;

    if (redis) {
        try {
            const limiter = new Ratelimit({
                redis,
                limiter: Ratelimit.slidingWindow(limit.limit, `${limit.windowSeconds} s`),
                prefix: 'ai-gateway',
                analytics: false,
            });
            const result = await limiter.limit(key);
            return { success: result.success, remaining: result.remaining, reset: result.reset };
        } catch (err) {
            logger.warn('AI rate limiter Redis call failed; using memory fallback', undefined, err);
        }
    } else if (!warnedNoRedis && process.env.NODE_ENV === 'production') {
        warnedNoRedis = true;
        logger.warn('AI rate limiter has no Redis; in-memory fallback is ineffective on serverless');
    }

    return memoryCheck(key, limit);
}
