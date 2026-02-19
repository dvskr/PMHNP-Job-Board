import { prisma } from '@/lib/prisma';
import FeaturedJobs from '@/components/FeaturedJobs';

// Revalidate every 60 seconds — fresh data without per-request DB hits
export const revalidate = 60;

/**
 * FeaturedJobsSection (Server Component)
 *
 * Fetches 6 jobs for the homepage:
 * - Only jobs posted within the last 3 days (originalPostedAt or createdAt)
 * - Sorted by qualityScore descending (best quality first)
 * - Max 2 jobs per employer for variety
 * - Excludes expired jobs
 */
export default async function FeaturedJobsSection() {
    const TARGET = 6;
    const MAX_PER_EMPLOYER = 2;

    // 3-day window
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const now = new Date();

    const selectFields = {
        id: true,
        slug: true,
        title: true,
        employer: true,
        location: true,
        jobType: true,
        displaySalary: true,
        createdAt: true,
        originalPostedAt: true,
    } as const;

    type RawJob = {
        id: string;
        slug: string | null;
        title: string;
        employer: string;
        location: string;
        jobType: string | null;
        displaySalary: string | null;
        createdAt: Date;
        originalPostedAt: Date | null;
    };

    let jobs: {
        id: string;
        slug: string | null;
        title: string;
        employer: string;
        location: string;
        jobType: string | null;
        displaySalary: string | null;
        createdAt: string;
        originalPostedAt: string | null;
    }[] = [];

    try {
        // Fetch recent high-quality jobs — get extra to allow employer-cap filtering
        const candidates = await prisma.job.findMany({
            where: {
                isPublished: true,
                OR: [
                    { originalPostedAt: { gte: threeDaysAgo } },
                    { originalPostedAt: null, createdAt: { gte: threeDaysAgo } },
                ],
                AND: [
                    {
                        OR: [
                            { expiresAt: null },
                            { expiresAt: { gt: now } },
                        ],
                    },
                ],
            },
            orderBy: [
                { qualityScore: 'desc' },
                { originalPostedAt: { sort: 'desc', nulls: 'last' } },
                { createdAt: 'desc' },
            ],
            take: TARGET * 5,
            select: selectFields,
        });

        // Apply max-per-employer cap
        const collected: RawJob[] = [];
        const employerCount = new Map<string, number>();

        for (const j of candidates) {
            if (collected.length >= TARGET) break;
            const key = j.employer.toLowerCase().trim();
            const count = employerCount.get(key) ?? 0;
            if (count >= MAX_PER_EMPLOYER) continue;
            employerCount.set(key, count + 1);
            collected.push(j);
        }

        jobs = collected.map((j) => ({
            ...j,
            createdAt: j.createdAt.toISOString(),
            originalPostedAt: j.originalPostedAt?.toISOString() ?? null,
        }));
    } catch (error) {
        console.error('Error fetching featured jobs:', error instanceof Error ? error.message : error);
        console.error('Full error:', JSON.stringify(error, null, 2));
    }

    console.log(`[FeaturedJobsSection] Fetched ${jobs.length} jobs`);

    return <FeaturedJobs jobs={jobs} />;
}

