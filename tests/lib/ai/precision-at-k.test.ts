/**
 * The talent-search rerank gate is the entire CI signal for "did the rerank
 * prompt get worse?" — if precision@K math drifts, the lift comparison
 * silently passes bad reranks. Lock the math.
 */

import { describe, it, expect } from 'vitest';
import {
    precisionAtK,
    cosineSimilarity,
    parseCandidateList,
    RERANK_LIFT_REQUIRED,
} from '@/lib/ai/eval/suites/talent-search-rerank';

describe('precisionAtK', () => {
    it('returns 1.0 when actual top-K matches expected exactly', () => {
        expect(precisionAtK([1, 2, 3], [1, 2, 3], 3)).toBe(1);
    });

    it('returns 1.0 when expected is empty (vacuous perfect)', () => {
        expect(precisionAtK([1, 2, 3], [], 3)).toBe(1);
    });

    it('returns 0 when actual is empty', () => {
        expect(precisionAtK([], [1, 2, 3], 3)).toBe(0);
    });

    it('returns 0 when no expected items appear in top-K', () => {
        expect(precisionAtK([4, 5, 6], [1, 2, 3], 3)).toBe(0);
    });

    it('correctly counts partial hits', () => {
        // 2 of expected (1, 2) hit in top-3 ranking [1, 2, 99] → 2/3
        expect(precisionAtK([1, 2, 99], [1, 2, 3], 3)).toBeCloseTo(2 / 3, 6);
    });

    it('only counts hits inside the top-K window', () => {
        // Expected 1 is at position 5; K=3 → no hit → precision 0
        expect(precisionAtK([10, 11, 12, 13, 1], [1], 3)).toBe(0);
    });

    it('divides by actual.length when K is larger than actual', () => {
        // K=5 but only 2 results returned; both hit → 2/2 = 1.0
        // (NOT 2/5 = 0.4 — that would penalize for short result sets)
        expect(precisionAtK([1, 2], [1, 2, 3], 5)).toBeCloseTo(1, 6);
    });

    it('is order-insensitive within the top-K window', () => {
        // Both rankings have the same 2 hits in top-3, just in different order.
        const a = precisionAtK([1, 2, 99], [1, 2], 3);
        const b = precisionAtK([2, 1, 99], [1, 2], 3);
        expect(a).toBe(b);
    });

    it('returns 0 when K is 0', () => {
        expect(precisionAtK([1, 2, 3], [1, 2], 0)).toBe(0);
    });
});

describe('cosineSimilarity', () => {
    it('returns 1.0 for identical vectors', () => {
        expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
    });

    it('returns 0 for orthogonal vectors', () => {
        expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 6);
    });

    it('returns -1.0 for opposite vectors', () => {
        expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 6);
    });

    it('returns 0 for length mismatch (defensive)', () => {
        expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    });

    it('returns 0 for empty vectors', () => {
        expect(cosineSimilarity([], [])).toBe(0);
    });

    it('returns 0 when one input is the zero vector (avoids NaN)', () => {
        expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
        expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
    });

    it('is symmetric: sim(a, b) === sim(b, a)', () => {
        const a = [0.5, 0.3, 0.2];
        const b = [0.1, 0.7, 0.4];
        expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 9);
    });
});

describe('parseCandidateList', () => {
    it('parses a single candidate', () => {
        const out = parseCandidateList('Candidate #1 | Headline: PMHNP | Years: 5');
        expect(out.size).toBe(1);
        expect(out.get(1)).toContain('Headline: PMHNP');
    });

    it('parses multiple candidates separated by single newlines', () => {
        const list = 'Candidate #1 | Headline: A\nCandidate #2 | Headline: B\nCandidate #3 | Headline: C';
        const out = parseCandidateList(list);
        expect(out.size).toBe(3);
        expect(out.get(1)).toContain('A');
        expect(out.get(2)).toContain('B');
        expect(out.get(3)).toContain('C');
    });

    it('parses multiple candidates separated by blank lines', () => {
        const list = 'Candidate #1 | A\n\nCandidate #2 | B\n\nCandidate #3 | C';
        const out = parseCandidateList(list);
        expect(out.size).toBe(3);
    });

    it('uses the candidate-number as the map key (1-indexed)', () => {
        const list = 'Candidate #2 | A\nCandidate #5 | B\nCandidate #1 | C';
        const out = parseCandidateList(list);
        expect(out.size).toBe(3);
        expect(out.has(1)).toBe(true);
        expect(out.has(2)).toBe(true);
        expect(out.has(5)).toBe(true);
        expect(out.has(3)).toBe(false);
    });

    it('returns an empty map for an empty / whitespace input', () => {
        expect(parseCandidateList('').size).toBe(0);
        expect(parseCandidateList('   \n\n  ').size).toBe(0);
    });

    it('skips blocks that do not start with `Candidate #`', () => {
        const list = 'Random preamble\n\nCandidate #1 | A\n\nFooter';
        const out = parseCandidateList(list);
        expect(out.size).toBe(1);
        expect(out.has(1)).toBe(true);
    });

    it('preserves the FULL candidate text in the value (used for embedding)', () => {
        const block = 'Candidate #1 | Headline: PMHNP-BC | Years: 8 | States: CA, OR | Specialties: Adult Telehealth';
        const out = parseCandidateList(block);
        expect(out.get(1)).toBe(block);
    });
});

describe('RERANK_LIFT_REQUIRED', () => {
    it('matches the spec value of 1.20 (20% better than vector)', () => {
        // Tied to docs/ai-implementation-plan.md §1.3.4 — bumping requires
        // a doc change and reviewer sign-off; lock the constant.
        expect(RERANK_LIFT_REQUIRED).toBe(1.20);
    });
});
