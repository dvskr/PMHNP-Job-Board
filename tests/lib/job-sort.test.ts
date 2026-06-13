/**
 * Job sort comparator tests.
 *
 * Pins the canonical "best" sort used everywhere on the platform
 * (job alert emails, /api/jobs, every category page).
 *
 * If you change BEST_SORT_ORDER_BY or compareJobsBest, update both AND this test.
 * Drift between the DB orderBy and the JS comparator is the bug this file exists to prevent.
 */

import { describe, it, expect } from 'vitest';
import {
    BEST_SORT_ORDER_BY,
    EMPLOYER_FIRST_KEY,
    buildJobsOrderBy,
    compareJobsBest,
    type JobSortable,
} from '@/lib/utils/job-sort';

const baseDate = new Date('2026-01-01T00:00:00Z');
const dayAfter = (days: number) => new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

const job = (overrides: Partial<JobSortable> = {}): JobSortable => ({
    isEmployerPosted: false,
    isFeatured: false,
    qualityScore: 50,
    originalPostedAt: baseDate,
    createdAt: baseDate,
    ...overrides,
});

describe('BEST_SORT_ORDER_BY (DB orderBy)', () => {
    it('has exactly five sort keys in canonical order', () => {
        expect(BEST_SORT_ORDER_BY).toEqual([
            { employerJobs: { id: 'asc' } },
            { isFeatured: 'desc' },
            { qualityScore: 'desc' },
            { originalPostedAt: 'desc' },
            { createdAt: 'desc' },
        ]);
    });

    it('is the same value as buildJobsOrderBy("best") (alias stays in lockstep)', () => {
        expect(BEST_SORT_ORDER_BY).toEqual(buildJobsOrderBy('best'));
    });
});

describe('buildJobsOrderBy — single source of truth for listing order', () => {
    // The employer-first lead is decoupled so the Phase B switch to a
    // denormalized boolean is a one-line change. Pin it so the interim trick
    // can't silently change shape.
    it('EMPLOYER_FIRST_KEY is the employer-relation lead key', () => {
        expect(EMPLOYER_FIRST_KEY).toEqual({ employerJobs: { id: 'asc' } });
    });

    it('best pins employer-first, then featured → quality → recency', () => {
        expect(buildJobsOrderBy('best')).toEqual([
            EMPLOYER_FIRST_KEY,
            { isFeatured: 'desc' },
            { qualityScore: 'desc' },
            { originalPostedAt: 'desc' },
            { createdAt: 'desc' },
        ]);
    });

    it('newest does NOT pin employer-first (an explicit chronological sort honors recency)', () => {
        const order = buildJobsOrderBy('newest');
        expect(order[0]).not.toEqual(EMPLOYER_FIRST_KEY);
        expect(order).toEqual([
            { originalPostedAt: { sort: 'desc', nulls: 'last' } },
            { createdAt: 'desc' },
        ]);
    });

    it('salary does NOT pin employer-first (pinning would make the salary column lie)', () => {
        const order = buildJobsOrderBy('salary');
        expect(order[0]).not.toEqual(EMPLOYER_FIRST_KEY);
        expect(order).toEqual([
            { normalizedMaxSalary: { sort: 'desc', nulls: 'last' } },
            { normalizedMinSalary: { sort: 'desc', nulls: 'last' } },
            { createdAt: 'desc' },
        ]);
    });

    it('employerFirst: false drops the lead on best', () => {
        expect(buildJobsOrderBy('best', { employerFirst: false })[0]).not.toEqual(EMPLOYER_FIRST_KEY);
    });

    it('employerFirst: true adds the lead on newest', () => {
        expect(buildJobsOrderBy('newest', { employerFirst: true })[0]).toEqual(EMPLOYER_FIRST_KEY);
    });

    it('falls back to the pinned best order for an unknown sort value', () => {
        // ?sort= comes from the URL; an unrecognized value must not drop the pin.
        expect(buildJobsOrderBy('bogus' as unknown as 'best')).toEqual(buildJobsOrderBy('best'));
    });
});

describe('compareJobsBest', () => {
    it('employer-posted beats non-employer regardless of other fields (new top-level rule)', () => {
        const employer = job({ isEmployerPosted: true, isFeatured: false, qualityScore: 0, createdAt: dayAfter(-365) });
        const fresh = job({ isEmployerPosted: false, isFeatured: false, qualityScore: 100, createdAt: dayAfter(0) });

        expect(compareJobsBest(employer, fresh)).toBeLessThan(0);
        expect(compareJobsBest(fresh, employer)).toBeGreaterThan(0);
    });

    it('within employer tier, featured beats non-featured (reserved for future premium tier)', () => {
        const premium = job({ isEmployerPosted: true, isFeatured: true, qualityScore: 0 });
        const standard = job({ isEmployerPosted: true, isFeatured: false, qualityScore: 100 });

        expect(compareJobsBest(premium, standard)).toBeLessThan(0);
        expect(compareJobsBest(standard, premium)).toBeGreaterThan(0);
    });

    it('within same featured tier, higher qualityScore wins', () => {
        const high = job({ qualityScore: 80 });
        const low = job({ qualityScore: 40 });

        expect(compareJobsBest(high, low)).toBeLessThan(0);
        expect(compareJobsBest(low, high)).toBeGreaterThan(0);
    });

    it('the +30 employer-posted qualityScore bonus floats employer posts above aggregator posts', () => {
        // Real scenario: employer post (qualityScore 65 = 30 employer + 15 salary + 10 desc + 10 location)
        // beats a fresher aggregator post (qualityScore 50 = 30 link + 10 salary + 10 desc).
        const employerPost = job({ qualityScore: 65, originalPostedAt: dayAfter(-3) });
        const aggregatorPost = job({ qualityScore: 50, originalPostedAt: dayAfter(0) });

        expect(compareJobsBest(employerPost, aggregatorPost)).toBeLessThan(0);
    });

    it('within same featured + qualityScore, newer originalPostedAt wins', () => {
        const newer = job({ originalPostedAt: dayAfter(0) });
        const older = job({ originalPostedAt: dayAfter(-7) });

        expect(compareJobsBest(newer, older)).toBeLessThan(0);
    });

    it('falls back to createdAt when originalPostedAt is null on both sides', () => {
        const newer = job({ originalPostedAt: null, createdAt: dayAfter(0) });
        const older = job({ originalPostedAt: null, createdAt: dayAfter(-7) });

        expect(compareJobsBest(newer, older)).toBeLessThan(0);
    });

    it('treats null originalPostedAt as oldest when only one side has it', () => {
        const hasPosted = job({ originalPostedAt: dayAfter(-30) });
        const nullPosted = job({ originalPostedAt: null, createdAt: dayAfter(0) });

        // hasPosted with -30d should still come first because nullPosted's
        // originalPostedAt is treated as epoch (0), older than -30d.
        expect(compareJobsBest(hasPosted, nullPosted)).toBeLessThan(0);
    });

    it('treats null qualityScore as 0', () => {
        const known = job({ qualityScore: 1 });
        const unknown = job({ qualityScore: null });

        expect(compareJobsBest(known, unknown)).toBeLessThan(0);
    });

    it('returns 0 for fully equal jobs (stable)', () => {
        const a = job();
        const b = job();
        expect(compareJobsBest(a, b)).toBe(0);
    });

    it('sorts a realistic mixed list correctly', () => {
        const featuredOld = job({ isFeatured: true, qualityScore: 60, originalPostedAt: dayAfter(-10) });
        const featuredHighQuality = job({ isFeatured: true, qualityScore: 95, originalPostedAt: dayAfter(-5) });
        const employerNonFeatured = job({ isFeatured: false, qualityScore: 75, originalPostedAt: dayAfter(0) });
        const aggregatorRecent = job({ isFeatured: false, qualityScore: 45, originalPostedAt: dayAfter(0) });
        const aggregatorOld = job({ isFeatured: false, qualityScore: 45, originalPostedAt: dayAfter(-30) });

        const sorted = [aggregatorOld, featuredOld, aggregatorRecent, featuredHighQuality, employerNonFeatured]
            .sort(compareJobsBest);

        // Expected order:
        //   1. featuredHighQuality (featured, qs 95)
        //   2. featuredOld         (featured, qs 60)
        //   3. employerNonFeatured (qs 75 outranks 45)
        //   4. aggregatorRecent    (qs 45, recent)
        //   5. aggregatorOld       (qs 45, old)
        expect(sorted).toEqual([
            featuredHighQuality,
            featuredOld,
            employerNonFeatured,
            aggregatorRecent,
            aggregatorOld,
        ]);
    });
});
