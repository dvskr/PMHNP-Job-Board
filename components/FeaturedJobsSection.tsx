import { prisma } from '@/lib/prisma';
import FeaturedJobs from '@/components/FeaturedJobs';

/**
 * FeaturedJobsSection (Server Component)
 *
 * Fetches the 6 most recent published jobs and passes them
 * to the FeaturedJobs client component.
 */
export default async function FeaturedJobsSection() {
    let jobs: {
        id: string;
        slug: string | null;
        title: string;
        employer: string;
        location: string;
        jobType: string | null;
        displaySalary: string | null;
        createdAt: string;
    }[] = [];

    try {
        const rawJobs = await prisma.job.findMany({
            where: { isPublished: true },
            orderBy: { createdAt: 'desc' },
            take: 6,
            select: {
                id: true,
                slug: true,
                title: true,
                employer: true,
                location: true,
                jobType: true,
                displaySalary: true,
                createdAt: true,
            },
        });

        jobs = rawJobs.map((j) => ({
            ...j,
            createdAt: j.createdAt.toISOString(),
        }));
    } catch (error) {
        console.error('Error fetching featured jobs:', error instanceof Error ? error.message : error);
        console.error('Full error:', JSON.stringify(error, null, 2));
    }

    console.log(`[FeaturedJobsSection] Fetched ${jobs.length} jobs`);

    return <FeaturedJobs jobs={jobs} />;
}
