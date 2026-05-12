/**
 * Registry invariants: every JobSource has an aggregator, every
 * aggregator's `key` matches its registry key, and chunkCount is sane.
 */

import { describe, it, expect } from 'vitest';
import { aggregators } from '@/lib/aggregators/registry';
import type { JobSource } from '@/lib/aggregators/types';

describe('aggregator registry', () => {
    const ALL_SOURCES: JobSource[] = [
        'adzuna',
        'greenhouse',
        'lever',
        'workday',
        'fantastic-jobs-db',
        'smartrecruiters',
        'usajobs',
        'ashby',
        'bamboohr',
        'jazzhr',
        'workable',
        'doccafe',
        'healthcareercenter',
    ];

    it('registry contains every JobSource', () => {
        for (const src of ALL_SOURCES) {
            expect(aggregators[src]).toBeDefined();
        }
    });

    it('every aggregator advertises its own key', () => {
        for (const [key, agg] of Object.entries(aggregators)) {
            expect(agg.key).toBe(key);
        }
    });

    it('chunkCount is a positive integer for every adapter', () => {
        for (const [key, agg] of Object.entries(aggregators)) {
            expect(Number.isInteger(agg.chunkCount), `${key} chunkCount must be integer`).toBe(true);
            expect(agg.chunkCount, `${key} chunkCount must be ≥ 1`).toBeGreaterThanOrEqual(1);
        }
    });

    it('greenhouse and workday are the only chunked sources', () => {
        const chunked = Object.entries(aggregators)
            .filter(([, a]) => a.chunkCount > 1)
            .map(([k]) => k)
            .sort();
        expect(chunked).toEqual(['greenhouse', 'workday']);
    });

    it('every aggregator exposes fetch()', () => {
        for (const [key, agg] of Object.entries(aggregators)) {
            expect(typeof agg.fetch, `${key} must implement fetch()`).toBe('function');
        }
    });
});
