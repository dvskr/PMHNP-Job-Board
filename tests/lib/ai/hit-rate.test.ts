/**
 * hitRate() math underpins the candidate-recommendations CI gate. Test it
 * the same way we test ndcgAtK.
 */

import { describe, it, expect } from 'vitest';
import { hitRate } from '@/lib/ai/eval/suites/candidate-recommendations';

describe('hitRate', () => {
    it('returns 1.0 when every expected job appears in actual', () => {
        expect(hitRate(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
    });

    it('returns 1.0 (vacuously) when expected is empty', () => {
        expect(hitRate(['a', 'b'], [])).toBe(1);
    });

    it('returns 0 when no expected jobs appear', () => {
        expect(hitRate(['x', 'y'], ['a', 'b'])).toBe(0);
    });

    it('returns 0.5 for half the expected jobs hit', () => {
        expect(hitRate(['a', 'x', 'y'], ['a', 'b'])).toBe(0.5);
    });

    it('does not penalize extra actual entries beyond expected', () => {
        // 1 of 1 expected is in actual; extra actuals are fine.
        expect(hitRate(['a', 'x', 'y', 'z'], ['a'])).toBe(1);
    });

    it('order does not matter (set semantics)', () => {
        expect(hitRate(['c', 'a', 'b'], ['a', 'b', 'c'])).toBe(1);
    });
});
