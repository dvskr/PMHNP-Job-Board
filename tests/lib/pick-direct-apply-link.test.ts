import { describe, it, expect } from 'vitest';

/**
 * Tests for the pickDirectApplyLink logic used in jsearch.ts
 * Validates that direct employer links are preferred over aggregator redirects.
 */

// Mirror the JSearch job structure (subset for testing)
interface MockJSearchJob {
    job_apply_link: string;
    job_apply_is_direct: boolean;
    apply_options: Array<{
        publisher: string;
        apply_link: string;
        is_direct: boolean;
    }> | null;
}

// Extracted logic to test independently
function pickDirectApplyLink(job: MockJSearchJob): string {
    if (job.job_apply_is_direct) {
        return job.job_apply_link;
    }

    if (job.apply_options?.length) {
        const directOption = job.apply_options.find(opt => opt.is_direct);
        if (directOption?.apply_link) {
            return directOption.apply_link;
        }
    }

    return job.job_apply_link;
}

describe('pickDirectApplyLink', () => {
    it('returns main link when job_apply_is_direct is true', () => {
        const job: MockJSearchJob = {
            job_apply_link: 'https://employer.com/careers/job/123',
            job_apply_is_direct: true,
            apply_options: [
                { publisher: 'Indeed', apply_link: 'https://indeed.com/job/123', is_direct: false },
            ],
        };
        expect(pickDirectApplyLink(job)).toBe('https://employer.com/careers/job/123');
    });

    it('returns direct option when main link is not direct', () => {
        const job: MockJSearchJob = {
            job_apply_link: 'https://indeed.com/redirect/abc',
            job_apply_is_direct: false,
            apply_options: [
                { publisher: 'Indeed', apply_link: 'https://indeed.com/job/123', is_direct: false },
                { publisher: 'Employer Site', apply_link: 'https://employer.com/careers/job/123', is_direct: true },
                { publisher: 'LinkedIn', apply_link: 'https://linkedin.com/job/456', is_direct: false },
            ],
        };
        expect(pickDirectApplyLink(job)).toBe('https://employer.com/careers/job/123');
    });

    it('falls back to main link when no direct options exist', () => {
        const job: MockJSearchJob = {
            job_apply_link: 'https://indeed.com/redirect/abc',
            job_apply_is_direct: false,
            apply_options: [
                { publisher: 'Indeed', apply_link: 'https://indeed.com/job/123', is_direct: false },
                { publisher: 'LinkedIn', apply_link: 'https://linkedin.com/job/456', is_direct: false },
            ],
        };
        expect(pickDirectApplyLink(job)).toBe('https://indeed.com/redirect/abc');
    });

    it('falls back to main link when apply_options is null', () => {
        const job: MockJSearchJob = {
            job_apply_link: 'https://indeed.com/redirect/abc',
            job_apply_is_direct: false,
            apply_options: null,
        };
        expect(pickDirectApplyLink(job)).toBe('https://indeed.com/redirect/abc');
    });

    it('falls back to main link when apply_options is empty', () => {
        const job: MockJSearchJob = {
            job_apply_link: 'https://indeed.com/redirect/abc',
            job_apply_is_direct: false,
            apply_options: [],
        };
        expect(pickDirectApplyLink(job)).toBe('https://indeed.com/redirect/abc');
    });

    it('picks first direct option when multiple direct options exist', () => {
        const job: MockJSearchJob = {
            job_apply_link: 'https://indeed.com/redirect/abc',
            job_apply_is_direct: false,
            apply_options: [
                { publisher: 'Company ATS', apply_link: 'https://ats.company.com/job/123', is_direct: true },
                { publisher: 'Employer Site', apply_link: 'https://employer.com/careers/job/123', is_direct: true },
            ],
        };
        expect(pickDirectApplyLink(job)).toBe('https://ats.company.com/job/123');
    });
});
