/**
 * BambooHR detail-fetch fix (2026-08-19).
 *
 * The careers/list payload carries no description, so pre-fix every
 * title-relevant candidate shipped a ~5-line synthetic blob and died at
 * the orchestrator's soft completeness floor. These tests pin:
 *   - detail description / datePosted / compensation / location merge
 *   - detail fetched ONLY for title-relevant candidates
 *   - graceful fallback to the synthetic blob when detail fails
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/aggregators/tenants/bamboohr', () => ({
    BAMBOOHR_TENANTS: [{ slug: 'acme-bh', name: 'Acme Behavioral Health' }],
}));

import { fetchBambooHrJobs } from '@/lib/aggregators/bamboohr';

const LIST_URL = 'https://acme-bh.bamboohr.com/careers/list';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

const RELEVANT_JOB = {
    id: '101',
    jobOpeningName: 'Psychiatric Nurse Practitioner (PMHNP)',
    employmentStatusLabel: 'Full-Time',
    locationCity: 'Columbus',
    locationState: 'Ohio',
};
const IRRELEVANT_JOB = { id: '102', jobOpeningName: 'Front Desk Receptionist' };

describe('fetchBambooHrJobs detail enrichment', () => {
    const detailCalls: string[] = [];

    beforeEach(() => {
        detailCalls.length = 0;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function stubFetch(detail: object | null, detailStatus = 200) {
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url === LIST_URL) {
                return jsonResponse({ meta: { totalCount: 2 }, result: [RELEVANT_JOB, IRRELEVANT_JOB] });
            }
            const m = /\/careers\/(\d+)\/detail$/.exec(url);
            if (m) {
                detailCalls.push(m[1]);
                if (detail === null) return jsonResponse({}, detailStatus);
                return jsonResponse({ result: { jobOpening: detail } });
            }
            throw new Error(`unexpected fetch: ${url}`);
        }));
    }

    it('merges the detail description, datePosted, and compensation into the job', async () => {
        stubFetch({
            description: '<p>We are seeking a PMHNP to join our outpatient team. '.repeat(10) + '</p>',
            datePosted: '2026-08-14',
            compensation: '$120,000-$140,000 per year',
        });

        const jobs = await fetchBambooHrJobs();

        expect(jobs).toHaveLength(1);
        const job = jobs[0];
        expect(job.externalId).toBe('bamboohr-acme-bh-101');
        expect(job.description).toContain('We are seeking a PMHNP');
        expect(job.description.length).toBeGreaterThan(400);
        expect(job.description).toContain('Compensation: $120,000-$140,000 per year');
        expect(job.postedDate).toBe('2026-08-14');
        expect(job.location).toBe('Columbus, Ohio');
    });

    it('fetches detail only for title-relevant candidates', async () => {
        stubFetch({ description: '<p>desc</p>' });

        await fetchBambooHrJobs();

        expect(detailCalls).toEqual(['101']); // never 102
    });

    it('falls back to the synthetic list-field blob when detail fails', async () => {
        stubFetch(null, 500);

        const jobs = await fetchBambooHrJobs();

        expect(jobs).toHaveLength(1);
        // Pre-fix behavior preserved: synthetic blob from list fields.
        expect(jobs[0].description).toContain('Employer: Acme Behavioral Health');
        expect(jobs[0].description).toContain('Employment: Full-Time');
        expect(jobs[0].postedDate).toBeUndefined();
    });

    it('prefers detail location fields only when the list row lacks them', async () => {
        stubFetch({
            description: '<p>desc</p>',
            location: { city: 'Toledo', state: 'Ohio' },
        });

        const jobs = await fetchBambooHrJobs();

        // List row already carries Columbus — the list value wins.
        expect(jobs[0].location).toBe('Columbus, Ohio');
    });
});
