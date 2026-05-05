/**
 * RateLimiter — minimal-interval throttle used across adapters.
 *
 * Pins:
 *   - First call: zero wait
 *   - Subsequent calls: exact min-interval gap
 *   - Drift handling: waits never go negative
 *   - reset(): allows the next call to fire immediately
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '@/lib/aggregators/types';

describe('RateLimiter', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('first call resolves immediately', async () => {
        const rl = new RateLimiter(500);
        const start = Date.now();
        await rl.throttle();
        expect(Date.now() - start).toBe(0);
    });

    it('subsequent calls wait the minimum interval', async () => {
        const rl = new RateLimiter(500);
        await rl.throttle(); // primes nextEarliestAt = now + 500
        const promise = rl.throttle();

        // Promise should still be pending — no wait yet
        const settled = vi.fn();
        promise.then(settled);
        await vi.advanceTimersByTimeAsync(499);
        expect(settled).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(settled).toHaveBeenCalled();
    });

    it('reset() lets the next call fire immediately', async () => {
        const rl = new RateLimiter(500);
        await rl.throttle();
        rl.reset();
        const start = Date.now();
        await rl.throttle();
        expect(Date.now() - start).toBe(0);
    });

    it('back-to-back calls compose so each waits one interval', async () => {
        const rl = new RateLimiter(100);
        const log: number[] = [];
        const startedAt = Date.now();
        const tick = () => log.push(Date.now() - startedAt);

        await rl.throttle(); tick();
        const p1 = rl.throttle().then(tick);
        const p2 = rl.throttle().then(tick);

        await vi.advanceTimersByTimeAsync(100);
        await p1;
        await vi.advanceTimersByTimeAsync(100);
        await p2;

        // Three calls, expected gaps: [0, 100, 200]
        expect(log).toEqual([0, 100, 200]);
    });
});
