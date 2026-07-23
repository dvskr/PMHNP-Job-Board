import { jsonLdString } from '@/lib/seo/json-ld';
import { prisma } from '@/lib/prisma';
import FeaturedJobs from '@/components/FeaturedJobs';
import { Prisma } from '@prisma/client';
import { classifyJob } from '@/lib/ai/job-classifier';
import {
    ATS_HOST_SUBSTRINGS,
    isEmployerPosting,
} from '@/lib/ai/recommendation-policy';
import {
    sixHourBucket,
    sortByJitteredScore,
} from '@/lib/utils/rotation';

// Revalidate every 60 seconds — fresh data without per-request DB hits
export const revalidate = 60;

const TARGET = 8;
const MAX_PER_EMPLOYER = 2;
const EMPLOYER_PIN_COUNT = 2;

/**
 * FeaturedJobsSection (Server Component)
 *
 * Fetches 8 jobs for the homepage:
 *   - Posted within the last 3 days (originalPostedAt or createdAt)
 *   - **Excludes external (aggregator-bounce) jobs** — only direct_apply +
 *     easy_apply paths surface here. Filter is applied DB-side via
 *     sourceType + applyLink-host substrings, then double-checked in JS via
 *     `classifyJob` so a misclassified row never sneaks through.
 *   - Pins up to 2 `sourceType='employer'` postings, rotated by 6h time
 *     bucket so the cached ISR page surfaces fresh employer slots through
 *     the day without per-request DB churn.
 *   - Sorts the rest by qualityScore desc.
 *   - Caps any single employer at 2 cards (incl. the pinned slots).
 *   - Skips expired jobs.
 */
export default async function FeaturedJobsSection() {
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
        // Classification + ranking signals (used to filter externals and
        // pick the pinned employer postings; not surfaced to the client).
        sourceType: true,
        applyOnPlatform: true,
        applyLink: true,
        healthConsecutiveMissing: true,
        qualityScore: true,
    } as const;

    // DB-side direct-apply filter — every row that surfaces must be either an
    // employer posting OR an aggregator job whose applyLink points to a known
    // ATS host. JS post-filter (classifyJob) catches edge cases where the
    // host substring is loose (e.g. 'careers.' / 'jobs.').
    const directApplyOnly: Prisma.JobWhereInput = {
        OR: [
            { sourceType: 'employer' },
            { sourceType: 'direct' },
            ...ATS_HOST_SUBSTRINGS.map((host) => ({
                applyLink: { contains: host, mode: 'insensitive' as const },
            })),
        ],
    };

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
        sourceType: string | null;
        applyOnPlatform: boolean;
        applyLink: string | null;
        healthConsecutiveMissing: number | null;
        qualityScore: number | null;
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
        // Overfetch — DB pre-filter is broad (host substrings), JS classify
        // narrows further, employer-pin + per-employer cap shrink again.
        // 5× target leaves headroom for all three to reduce.
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
                    directApplyOnly,
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

        // Belt-and-braces JS classification — drops anything the DB filter
        // let through that classifyJob still considers external/unhealthy.
        const eligible = (candidates as RawJob[]).filter((j) => {
            const { tier, isHealthy } = classifyJob(j);
            return isHealthy && tier !== 'external';
        });

        // 6h-bucket rotation — the same time window across all visitors so
        // the ISR cache stays useful, but the pinned set shifts 4× per day.
        const seed = `homepage-${sixHourBucket()}`;

        const employerPool = eligible.filter((j) => isEmployerPosting(j));
        const pinnedRaw = sortByJitteredScore(
            employerPool,
            (j) => j.qualityScore ?? 0,
            (j) => j.id,
            seed,
        ).slice(0, EMPLOYER_PIN_COUNT);
        const pinnedIds = new Set(pinnedRaw.map((j) => j.id));

        // Fill from non-pinned, in qualityScore order (Prisma already returned sorted).
        const fillPool = eligible.filter((j) => !pinnedIds.has(j.id));

        // Combine: pinned first, then score-sorted fill. Apply the per-employer cap.
        const ordered: RawJob[] = [...pinnedRaw, ...fillPool];
        const collected: RawJob[] = [];
        const employerCount = new Map<string, number>();
        for (const j of ordered) {
            if (collected.length >= TARGET) break;
            const key = j.employer.toLowerCase().trim();
            const count = employerCount.get(key) ?? 0;
            if (count >= MAX_PER_EMPLOYER) continue;
            employerCount.set(key, count + 1);
            collected.push(j);
        }

        jobs = collected.map((j) => ({
            id: j.id,
            slug: j.slug,
            title: j.title,
            employer: j.employer,
            location: j.location,
            jobType: j.jobType,
            displaySalary: j.displaySalary,
            createdAt: j.createdAt.toISOString(),
            originalPostedAt: j.originalPostedAt?.toISOString() ?? null,
        }));
    } catch (error) {
        console.error('Error fetching featured jobs:', error instanceof Error ? error.message : error);
        console.error('Full error:', JSON.stringify(error, null, 2));
    }

    console.log(`[FeaturedJobsSection] Fetched ${jobs.length} jobs`);

    return (
        <>
            {/* ItemList schema — enables job carousels in Google search */}
            {jobs.length > 0 && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: jsonLdString({
                            '@context': 'https://schema.org',
                            '@type': 'ItemList',
                            name: 'Featured PMHNP Jobs',
                            numberOfItems: jobs.length,
                            itemListElement: jobs.map((job, idx) => ({
                                '@type': 'ListItem',
                                position: idx + 1,
                                name: job.title,
                                url: `https://pmhnphiring.com/jobs/${job.slug || job.id}`,
                            })),
                        }),
                    }}
                />
            )}
            <FeaturedJobs jobs={jobs} />
        </>
    );
}
