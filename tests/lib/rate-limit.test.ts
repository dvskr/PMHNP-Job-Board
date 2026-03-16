/**
 * Rate Limiting Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

describe('Rate Limiting', () => {
    beforeEach(() => {
        // Note: In a real test, we'd clear the store between tests
        // For now, we use unique keys per test
    });

    it('allows requests under the limit', async () => {
        const key = `test-under-limit-${Date.now()}`;
        const config = { limit: 5, windowSeconds: 60 };

        const result1 = await checkRateLimit(key, config);
        expect(result1.success).toBe(true);
        expect(result1.remaining).toBe(4);

        const result2 = await checkRateLimit(key, config);
        expect(result2.success).toBe(true);
        expect(result2.remaining).toBe(3);
    });

    it('blocks requests over the limit', async () => {
        const key = `test-over-limit-${Date.now()}`;
        const config = { limit: 2, windowSeconds: 60 };

        await checkRateLimit(key, config); // 1
        await checkRateLimit(key, config); // 2

        const result = await checkRateLimit(key, config); // 3 - should be blocked
        expect(result.success).toBe(false);
        expect(result.remaining).toBe(0);
    });

    it('returns reset time', async () => {
        const key = `test-reset-time-${Date.now()}`;
        const config = { limit: 10, windowSeconds: 60 };

        const result = await checkRateLimit(key, config);
        expect(result.reset).toBeGreaterThan(Date.now());
        expect(result.reset).toBeLessThanOrEqual(Date.now() + 60000);
    });

    it('preset configs have expected values', () => {
        expect(RATE_LIMITS.subscribe.limit).toBe(10);
        expect(RATE_LIMITS.subscribe.windowSeconds).toBe(60);

        expect(RATE_LIMITS.postJob.limit).toBe(3);
        expect(RATE_LIMITS.postJob.windowSeconds).toBe(60);

        expect(RATE_LIMITS.contact.limit).toBe(5);
        expect(RATE_LIMITS.contact.windowSeconds).toBe(60);
    });
});
