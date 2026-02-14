import { prisma } from '@/lib/prisma';
import FeaturedJobs from '@/components/FeaturedJobs';

// Revalidate every 60 seconds — fresh data without per-request DB hits
export const revalidate = 60;

/**
 * FeaturedJobsSection (Server Component)
 *
 * Fetches 6 jobs for the homepage with priority:
 * 1. Employer featured posts (isFeatured = true) — most recent first
 * 2. Direct employer posts (has employerJobs relation) — most recent first
 * 3. High-salary jobs (mixed types) — highest salary, then most recent
 * 4. Fallback: newest jobs if above tiers don't fill 6 slots
 *
 * Constraints:
 * - Only jobs from the last 3 days
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

    // Shared filters: published, last 3 days, not expired
    const baseWhere = {
        isPublished: true,
        createdAt: { gte: threeDaysAgo },
        OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
        ],
    };

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
        const seenIds = new Set<string>();
        const employerCount = new Map<string, number>();
        const collected: RawJob[] = [];

        /** Add a job only if we haven't hit the per-employer cap */
        function tryAdd(j: RawJob): boolean {
            if (seenIds.has(j.id)) return false;
            const key = j.employer.toLowerCase().trim();
            const count = employerCount.get(key) ?? 0;
            if (count >= MAX_PER_EMPLOYER) return false;
            seenIds.add(j.id);
            employerCount.set(key, count + 1);
            collected.push(j);
            return true;
        }

        // ── Priority 1: Employer featured posts ──
        if (collected.length < TARGET) {
            const featured = await prisma.job.findMany({
                where: { ...baseWhere, isFeatured: true },
                orderBy: { createdAt: 'desc' },
                take: TARGET * 3, // fetch extra to allow employer-cap filtering
                select: selectFields,
            });
            for (const j of featured) {
                if (collected.length >= TARGET) break;
                tryAdd(j);
            }
        }

        // ── Priority 2: Direct employer posts ──
        if (collected.length < TARGET) {
            const employerPosts = await prisma.job.findMany({
                where: {
                    ...baseWhere,
                    employerJobs: { isNot: null },
                    id: { notIn: Array.from(seenIds) },
                },
                orderBy: { createdAt: 'desc' },
                take: TARGET * 3,
                select: selectFields,
            });
            for (const j of employerPosts) {
                if (collected.length >= TARGET) break;
                tryAdd(j);
            }
        }

        // ── Priority 3: High-salary jobs (mixed types) ──
        if (collected.length < TARGET) {
            const highSalary = await prisma.job.findMany({
                where: {
                    ...baseWhere,
                    normalizedMaxSalary: { not: null },
                    id: { notIn: Array.from(seenIds) },
                },
                orderBy: [{ normalizedMaxSalary: 'desc' }, { createdAt: 'desc' }],
                take: TARGET * 3,
                select: selectFields,
            });
            for (const j of highSalary) {
                if (collected.length >= TARGET) break;
                tryAdd(j);
            }
        }

        // ── Fallback: newest jobs if still under target ──
        if (collected.length < TARGET) {
            const newest = await prisma.job.findMany({
                where: {
                    ...baseWhere,
                    id: { notIn: Array.from(seenIds) },
                },
                orderBy: { createdAt: 'desc' },
                take: TARGET * 3,
                select: selectFields,
            });
            for (const j of newest) {
                if (collected.length >= TARGET) break;
                tryAdd(j);
            }
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
