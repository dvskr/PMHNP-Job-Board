/**
 * Tests for buildRenewalEnrichmentDelta — added 2026-05-06.
 *
 * Renewal-time merge: when source returns better data on a re-ingest
 * of an existing row, fill missing fields and lengthen descriptions.
 * Never overwrite richer existing data with leaner fresh data; never
 * touch lifecycle fields (originalPostedAt / expiresAt).
 */
import { describe, it, expect } from 'vitest';
import { buildRenewalEnrichmentDelta } from '@/lib/ingestion-service';

const baseExisting = {
    description: null,
    descriptionSummary: null,
    minSalary: null,
    maxSalary: null,
    salaryPeriod: null,
    salaryRange: null,
    displaySalary: null,
    normalizedMinSalary: null,
    normalizedMaxSalary: null,
    city: null,
    state: null,
    stateCode: null,
    jobType: null,
    mode: null,
    experienceLevel: null,
    setting: null,
    population: null,
    benefits: [] as string[],
};

describe('buildRenewalEnrichmentDelta', () => {
    it('fills nulls when fresh data is present', () => {
        const delta = buildRenewalEnrichmentDelta(baseExisting, {
            minSalary: 90000,
            maxSalary: 120000,
            salaryPeriod: 'year',
            city: 'Boston',
            state: 'Massachusetts',
            stateCode: 'MA',
            jobType: 'Full-Time',
            mode: 'Hybrid',
        });
        expect(delta).toEqual({
            minSalary: 90000,
            maxSalary: 120000,
            salaryPeriod: 'year',
            city: 'Boston',
            state: 'Massachusetts',
            stateCode: 'MA',
            jobType: 'Full-Time',
            mode: 'Hybrid',
        });
    });

    it('does NOT overwrite existing non-null scalar values', () => {
        const existing = { ...baseExisting, minSalary: 80000, city: 'Boston', jobType: 'Full-Time' };
        const delta = buildRenewalEnrichmentDelta(existing, {
            minSalary: 95000, // ignored — existing is non-null
            city: 'Cambridge', // ignored
            jobType: 'Part-Time', // ignored
        });
        expect(delta).toEqual({});
    });

    it('replaces description ONLY when fresh is meaningfully longer (+50 chars)', () => {
        const existing = { ...baseExisting, description: 'Short desc.' };
        // 30 chars longer — not enough
        const small = buildRenewalEnrichmentDelta(existing, {
            description: 'Short desc with a tiny addition.',
        });
        expect(small.description).toBeUndefined();

        // 100+ chars longer — replace
        const big = buildRenewalEnrichmentDelta(existing, {
            description: 'A much longer description with many additional details about the job role, salary, and location.',
            descriptionSummary: 'Summary X',
        });
        expect(big.description).toMatch(/much longer/);
        expect(big.descriptionSummary).toBe('Summary X');
    });

    it('fills description when existing is null', () => {
        const delta = buildRenewalEnrichmentDelta(baseExisting, {
            description: 'A new description',
            descriptionSummary: 'New',
        });
        expect(delta.description).toBe('A new description');
        expect(delta.descriptionSummary).toBe('New');
    });

    it('unions benefits when fresh has additions', () => {
        const existing = { ...baseExisting, benefits: ['Health Insurance', '401k'] };
        const delta = buildRenewalEnrichmentDelta(existing, {
            benefits: ['401k', 'PTO', 'CME Allowance'],
        });
        expect(delta.benefits).toEqual(['Health Insurance', '401k', 'PTO', 'CME Allowance']);
    });

    it('omits benefits update when fresh adds nothing new', () => {
        const existing = { ...baseExisting, benefits: ['Health Insurance', '401k'] };
        const delta = buildRenewalEnrichmentDelta(existing, {
            benefits: ['401k'], // already present
        });
        expect(delta.benefits).toBeUndefined();
    });

    it('treats empty/null/missing fresh fields as no-op', () => {
        const delta = buildRenewalEnrichmentDelta(baseExisting, {
            minSalary: null,
            city: '',
            jobType: undefined,
        });
        expect(delta).toEqual({});
    });

    it('does NOT touch lifecycle fields even if fresh contains them', () => {
        // originalPostedAt / expiresAt are out of scope by design.
        const delta = buildRenewalEnrichmentDelta(baseExisting, {
            originalPostedAt: new Date(),
            expiresAt: new Date(),
            isPublished: false,
            applyLink: 'https://different.example.com',
            employer: 'Different Co',
        });
        expect(delta).toEqual({});
    });
});
