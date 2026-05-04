/**
 * Circuit breaker behavior — opens after consecutive failures,
 * stays open for the cooldown, then half-opens on the next try.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isAvailable, recordSuccess, recordFailure, __testing } from '@/lib/ai/circuit-breaker';

describe('lib/ai/circuit-breaker', () => {
    beforeEach(() => {
        __testing.reset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts closed (provider available)', () => {
        expect(isAvailable('openai')).toBe(true);
        expect(isAvailable('anthropic')).toBe(true);
    });

    it('stays closed below the failure threshold', () => {
        for (let i = 0; i < __testing.FAILURE_THRESHOLD - 1; i++) {
            recordFailure('openai');
        }
        expect(isAvailable('openai')).toBe(true);
    });

    it('opens at the failure threshold', () => {
        for (let i = 0; i < __testing.FAILURE_THRESHOLD; i++) {
            recordFailure('openai');
        }
        expect(isAvailable('openai')).toBe(false);
    });

    it('a single success resets the failure counter', () => {
        for (let i = 0; i < __testing.FAILURE_THRESHOLD - 1; i++) {
            recordFailure('openai');
        }
        recordSuccess('openai');
        // Should now need the full threshold again to open.
        for (let i = 0; i < __testing.FAILURE_THRESHOLD - 1; i++) {
            recordFailure('openai');
        }
        expect(isAvailable('openai')).toBe(true);
    });

    it('half-opens after the cooldown elapses', () => {
        vi.useFakeTimers();
        const start = new Date('2026-05-02T00:00:00Z');
        vi.setSystemTime(start);

        for (let i = 0; i < __testing.FAILURE_THRESHOLD; i++) {
            recordFailure('openai');
        }
        expect(isAvailable('openai')).toBe(false);

        // Advance just past the cooldown window.
        vi.setSystemTime(new Date(start.getTime() + __testing.COOLDOWN_MS + 1));
        expect(isAvailable('openai')).toBe(true);

        // Half-open state should have reset the counter.
        expect(__testing.snapshot('openai').failures).toBe(0);
    });

    it('isolates per-provider state', () => {
        for (let i = 0; i < __testing.FAILURE_THRESHOLD; i++) {
            recordFailure('openai');
        }
        expect(isAvailable('openai')).toBe(false);
        expect(isAvailable('anthropic')).toBe(true);
    });
});
