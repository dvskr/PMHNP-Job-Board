/**
 * S6 (audit 2026-05-31): jobs whose source listing has disappeared across
 * several consecutive health checks (`healthConsecutiveMissing`) were still
 * `isPublished=true` and therefore emitted into the sitemaps — Google crawls
 * them, hits a dead apply link, and records a soft-404 / quality signal.
 * 145 such jobs were live in prod. The indexable-job filter must exclude them.
 */
import { describe, it, expect } from 'vitest';
import { activeIndexableJobWhere, DEAD_LINK_MISS_THRESHOLD } from '@/lib/active-job-filter';
import { GLOBAL_EXCLUSIONS } from '@/lib/filters';

describe('S6: dead-link jobs are excluded from indexable surfaces', () => {
    it('threshold is a small positive integer', () => {
        expect(DEAD_LINK_MISS_THRESHOLD).toBeGreaterThan(0);
        expect(Number.isInteger(DEAD_LINK_MISS_THRESHOLD)).toBe(true);
    });

    it('only includes published jobs', () => {
        expect(activeIndexableJobWhere().isPublished).toBe(true);
    });

    it('excludes jobs failing repeated health checks (the fix)', () => {
        // Pre-fix the WHERE had no healthConsecutiveMissing gate at all.
        expect(activeIndexableJobWhere().healthConsecutiveMissing)
            .toEqual({ lt: DEAD_LINK_MISS_THRESHOLD });
    });

    it('keeps null/future expiry, excludes already-expired', () => {
        const now = new Date('2026-06-01T00:00:00Z');
        expect(activeIndexableJobWhere(now).OR).toEqual([
            { expiresAt: null },
            { expiresAt: { gt: now } },
        ]);
    });

    // Hunt 2026-09-03: the sitemaps and both syndication feeds advertised the
    // MD-Psychiatrist and off-specialty NP postings that GLOBAL_EXCLUSIONS
    // hides from every browse surface, because this predicate carried the
    // expiry and health gates but not the exclusions.
    it('carries every GLOBAL_EXCLUSIONS clause, negated', () => {
        const and = activeIndexableJobWhere().AND;
        expect(and).toEqual(GLOBAL_EXCLUSIONS.map((e) => ({ NOT: e })));
        expect(GLOBAL_EXCLUSIONS.length).toBeGreaterThan(0);
    });
});
