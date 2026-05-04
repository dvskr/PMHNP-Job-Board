/**
 * NDCG@K math is the entire CI gate for job-search quality. A regression
 * here silently passes bad rankings; lock the formula with tests.
 */

import { describe, it, expect } from 'vitest';
import { ndcgAtK } from '@/lib/ai/eval/suites/job-search';

describe('ndcgAtK', () => {
    it('returns 1.0 when actual ranking matches expected exactly', () => {
        expect(ndcgAtK(['a', 'b', 'c'], ['a', 'b', 'c'], 10)).toBeCloseTo(1, 6);
    });

    it('returns 1.0 when expected is empty (vacuous perfect — nothing to recall)', () => {
        expect(ndcgAtK(['a', 'b'], [], 10)).toBe(1);
    });

    it('returns 0 when none of the expected items appear in the top-K', () => {
        expect(ndcgAtK(['x', 'y', 'z'], ['a', 'b', 'c'], 10)).toBe(0);
    });

    it('penalizes when the right item is ranked lower than ideal', () => {
        // Expected one item, ranked at position 5 instead of 1.
        const ideal     = ndcgAtK(['a'],                    ['a'], 10); // = 1
        const degraded  = ndcgAtK(['x', 'y', 'z', 'w', 'a'], ['a'], 10);
        expect(degraded).toBeLessThan(ideal);
        expect(degraded).toBeGreaterThan(0);
    });

    it('truncates at K — items past position K do not contribute', () => {
        const inK    = ndcgAtK(['a', 'b'], ['a'], 10); // a at pos 1, in top-10
        const outOfK = ndcgAtK(
            ['x','y','z','w','v','u','t','s','r','q','a'], // a at pos 11
            ['a'],
            10,
        );
        expect(inK).toBe(1);
        expect(outOfK).toBe(0); // dropped past K
    });

    it('handles K smaller than expected list (only first K considered)', () => {
        // Expected 3 items but K=2 — best possible is top-2 of expected.
        const score = ndcgAtK(['a', 'b'], ['a', 'b', 'c'], 2);
        expect(score).toBeCloseTo(1, 6); // perfect within K
    });

    it('partial match returns a value between 0 and 1', () => {
        // 2 of 3 expected items in actual, in correct order.
        const score = ndcgAtK(['a', 'b', 'x'], ['a', 'b', 'c'], 10);
        expect(score).toBeGreaterThan(0.5);
        expect(score).toBeLessThan(1);
    });
});
