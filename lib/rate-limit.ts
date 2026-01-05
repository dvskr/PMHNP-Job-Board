/**
 * Rate Limiting Middleware
 * 
 * Supports two backends:
 * 1. Redis (via @upstash/ratelimit) - Preferred for production/serverless
 * 2. In-Memory (Map) - Fallback for local development or when Redis is unconfigured
 */

import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { logger } from './logger';

// --- Configuration ---

interface RateLimitConfig {
    /** Maximum requests allowed in the window */
    limit: number;
    /** Time window in seconds */
    windowSeconds: number;
}

// Preset configurations for common endpoints
export const RATE_LIMITS = {
    /** Newsletter subscription: 10 req/min */
    subscribe: { limit: 10, windowSeconds: 60 },
    /** Job posting: 3 req/min */
    postJob: { limit: 3, windowSeconds: 60 },
    /** Contact form: 5 req/min */
    contact: { limit: 5, windowSeconds: 60 },
    /** Job alerts: 10 req/min */
    jobAlerts: { limit: 10, windowSeconds: 60 },
    /** General API: 60 req/min */
    general: { limit: 60, windowSeconds: 60 },
    /** Auth endpoints: 10 req/min */
    auth: { limit: 10, windowSeconds: 60 },
    /** Uploads: 10 req/min */
    upload: { limit: 10, windowSeconds: 60 },
} as const;

// --- Redis Backend Setup ---

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    : null;

// --- In-Memory Backend Setup (Fallback) ---

interface MemoryEntry {
    count: number;
    resetTime: number;
}

const memoryStore = new Map<string, MemoryEntry>();

// Clean up old entries every minute
if (!redis) {
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of memoryStore.entries()) {
            if (now > entry.resetTime) {
                memoryStore.delete(key);
            }
        }
    }, 60000);
}

// --- Helpers ---

function getClientIp(request: Request): string {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }
    const realIp = request.headers.get('x-real-ip');
    if (realIp) {
        return realIp;
    }
    return '127.0.0.1';
}

function rateLimitExceeded(resetTime: number): NextResponse {
    const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
    return NextResponse.json(
        {
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter,
        },
        {
            status: 429,
            headers: {
                'Retry-After': String(retryAfter),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': String(Math.ceil(resetTime / 1000)),
            },
        }
    );
}

// --- Core Logic ---

/**
 * Check rate limit for a given key using the best available backend
 * Exported for testing
 */
export async function checkRateLimit(key: string, config: RateLimitConfig): Promise<{ success: boolean; reset: number; remaining: number }> {
    // Strategy 1: Redis (Production/Serverless)
    if (redis) {
        try {
            const limiter = new Ratelimit({
                redis: redis,
                limiter: Ratelimit.slidingWindow(config.limit, `${config.windowSeconds} s`),
                analytics: true,
                prefix: '@upstash/ratelimit',
            });

            const { success, reset, remaining } = await limiter.limit(key);
            return { success, reset, remaining };
        } catch (error) {
            logger.warn('Redis rate limit check failed, falling back to memory', { error });
            // Fallthrough to memory
        }
    }

    // Strategy 2: In-Memory (Fallback/Dev)
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const entry = memoryStore.get(key);

    if (!entry || now > entry.resetTime) {
        const reset = now + windowMs;
        memoryStore.set(key, { count: 1, resetTime: reset });
        return { success: true, reset, remaining: config.limit - 1 };
    }

    if (entry.count < config.limit) {
        entry.count++;
        return { success: true, reset: entry.resetTime, remaining: config.limit - entry.count };
    }

    return { success: false, reset: entry.resetTime, remaining: 0 };
}

/**
 * Rate limit middleware function to use in API routes
 */
export async function rateLimit(
    request: Request,
    endpointKey: string,
    config: RateLimitConfig
): Promise<NextResponse | null> {
    const ip = getClientIp(request);
    const key = `ratelimit:${endpointKey}:${ip}`;

    const { success, reset } = await checkRateLimit(key, config);

    if (!success) {
        return rateLimitExceeded(reset);
    }

    return null;
}

export { rateLimit as default };
