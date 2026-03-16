/**
 * Jobs Endpoint Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/jobs/route';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

// Helper to create NextRequest with query params
function createRequest(params: Record<string, string> = {}): NextRequest {
    const url = new URL('http://localhost:3000/api/jobs');
    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });
    return new NextRequest(url.toString());
}

const mockJobs = [
    {
        id: 'job-1',
        title: 'PMHNP - Remote',
        employer: 'Healthcare Co',
        location: 'Remote, CA',
        city: null,
        state: 'CA',
        jobType: 'Full-Time',
        isRemote: true,
        isHybrid: false,
        displaySalary: '$150k-$180k/yr',
        normalizedMinSalary: 150000,
        normalizedMaxSalary: 180000,
        salaryPeriod: 'year',
        description: 'Great PMHNP opportunity...',
        descriptionSummary: 'Great PMHNP opportunity...',
        createdAt: new Date(),
        isFeatured: false,
        isVerifiedEmployer: false,
        mode: 'Remote',
    },
    {
        id: 'job-2',
        title: 'Psychiatric NP - Featured',
        employer: 'Mental Health Clinic',
        location: 'New York, NY',
        city: 'New York',
        state: 'NY',
        jobType: 'Full-Time',
        isRemote: false,
        isHybrid: false,
        displaySalary: '$160k-$200k/yr',
        normalizedMinSalary: 160000,
        normalizedMaxSalary: 200000,
        salaryPeriod: 'year',
        description: 'Featured position...',
        descriptionSummary: 'Featured position...',
        createdAt: new Date(),
        isFeatured: true,
        isVerifiedEmployer: true,
        mode: 'On-site',
    },
];

describe('/api/jobs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns paginated jobs', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(prisma.job.findMany).mockResolvedValue(mockJobs as any);
        vi.mocked(prisma.job.count).mockResolvedValue(2);

        const request = createRequest();
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.jobs).toHaveLength(2);
        expect(data.total).toBe(2);
        expect(data.page).toBe(1);
        expect(data.totalPages).toBe(1);
    });

    it('handles pagination parameters', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(prisma.job.findMany).mockResolvedValue([mockJobs[0]] as any);
        vi.mocked(prisma.job.count).mockResolvedValue(50);

        const request = createRequest({ page: '2', limit: '10' });
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.page).toBe(2);
        expect(data.totalPages).toBe(5);

        // Verify skip/take was passed correctly
        expect(prisma.job.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                skip: 10, // (2-1) * 10
                take: 10,
            })
        );
    });

    it('returns empty array when no jobs found', async () => {
        vi.mocked(prisma.job.findMany).mockResolvedValue([]);
        vi.mocked(prisma.job.count).mockResolvedValue(0);

        const request = createRequest();
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.jobs).toHaveLength(0);
        expect(data.total).toBe(0);
    });

    it('handles database errors gracefully', async () => {
        vi.mocked(prisma.job.findMany).mockRejectedValue(new Error('DB Error'));

        const request = createRequest();
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe('Failed to fetch jobs');
    });

    it('orders by featured first, then by date', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(prisma.job.findMany).mockResolvedValue(mockJobs as any);
        vi.mocked(prisma.job.count).mockResolvedValue(2);

        const request = createRequest();
        await GET(request);

        expect(prisma.job.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                orderBy: [
                    { isFeatured: 'desc' },
                    { createdAt: 'desc' },
                ],
            })
        );
    });
});
