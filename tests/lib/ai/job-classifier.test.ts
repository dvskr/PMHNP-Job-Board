/**
 * Tier classification + health rules for the recommendation algorithm.
 * These tests guard the platform's revenue priority — a regression here
 * silently buries Easy-Apply jobs under external aggregator listings.
 */

import { describe, it, expect } from 'vitest';
import { classifyJob, isPlatformRevenueJob, HEALTH_DEAD_THRESHOLD } from '@/lib/ai/job-classifier';

describe('classifyJob', () => {
    describe('tier resolution', () => {
        it('employer-posted + applyOnPlatform → easy_apply', () => {
            const c = classifyJob({ sourceType: 'employer', applyOnPlatform: true, applyLink: null });
            expect(c.tier).toBe('easy_apply');
        });

        it('employer-posted but applies via external link → direct_apply (not easy_apply)', () => {
            const c = classifyJob({ sourceType: 'employer', applyOnPlatform: false, applyLink: 'https://careers.acme.com/job/1' });
            expect(c.tier).toBe('direct_apply');
        });

        it('aggregator with sourceType=direct → direct_apply', () => {
            const c = classifyJob({ sourceType: 'direct', applyOnPlatform: false, applyLink: 'https://example.com/job' });
            expect(c.tier).toBe('direct_apply');
        });

        it('aggregator scrape with apply_link pointing to a known ATS → direct_apply', () => {
            const c = classifyJob({ sourceType: 'external', applyOnPlatform: false, applyLink: 'https://boards.greenhouse.io/acme/jobs/1' });
            expect(c.tier).toBe('direct_apply');
        });

        it('aggregator scrape with non-ATS link → external', () => {
            const c = classifyJob({ sourceType: 'external', applyOnPlatform: false, applyLink: 'https://www.indeed.com/viewjob?jk=abc' });
            expect(c.tier).toBe('external');
        });

        it('null sourceType + no apply link → external (safe default)', () => {
            const c = classifyJob({ sourceType: null, applyOnPlatform: false });
            expect(c.tier).toBe('external');
        });
    });

    describe('health filter', () => {
        it('employer-posted jobs are always healthy regardless of missing-streak', () => {
            const c = classifyJob({ sourceType: 'employer', applyOnPlatform: true, healthConsecutiveMissing: 999 });
            expect(c.isHealthy).toBe(true);
        });

        it('aggregator job under the dead threshold is healthy', () => {
            const c = classifyJob({ sourceType: 'external', applyOnPlatform: false, healthConsecutiveMissing: HEALTH_DEAD_THRESHOLD - 1 });
            expect(c.isHealthy).toBe(true);
        });

        it('aggregator job at-or-over the dead threshold is unhealthy', () => {
            const c = classifyJob({ sourceType: 'external', applyOnPlatform: false, healthConsecutiveMissing: HEALTH_DEAD_THRESHOLD });
            expect(c.isHealthy).toBe(false);
        });

        it('null healthConsecutiveMissing → treated as 0 (healthy)', () => {
            const c = classifyJob({ sourceType: 'external', applyOnPlatform: false, healthConsecutiveMissing: null });
            expect(c.isHealthy).toBe(true);
        });
    });

    describe('isPlatformRevenueJob', () => {
        it('true for easy_apply', () => {
            expect(isPlatformRevenueJob({ sourceType: 'employer', applyOnPlatform: true })).toBe(true);
        });
        it('true for direct_apply (employer link)', () => {
            expect(isPlatformRevenueJob({ sourceType: 'employer', applyOnPlatform: false })).toBe(true);
        });
        it('true for direct_apply (aggregator-direct via ATS)', () => {
            expect(isPlatformRevenueJob({ sourceType: 'external', applyOnPlatform: false, applyLink: 'https://jobs.lever.co/acme' })).toBe(true);
        });
        it('false for external', () => {
            expect(isPlatformRevenueJob({ sourceType: 'external', applyOnPlatform: false, applyLink: 'https://aggregator.com/x' })).toBe(false);
        });
    });
});
