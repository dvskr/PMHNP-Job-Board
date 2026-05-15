import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { isAiFeatureEnabled } from '@/lib/ai/feature-flags'

/**
 * GET /api/dashboard — Return all data needed for the candidate dashboard
 * Query params: ?savedJobIds=id1,id2,id3 (comma-separated, from localStorage)
 */
export async function GET(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const savedJobIdsParam = url.searchParams.get('savedJobIds') || ''
        const savedJobIds = savedJobIdsParam ? savedJobIdsParam.split(',').filter(Boolean) : []

        // Run all queries in parallel
        const [profile, applicationCount, applications, alertCount, savedJobs, recommendedJobs, emailLead, unreadMessages] =
            await Promise.all([
                // 1. User profile
                // Selecting EVERY field calculateCompleteness reads from
                // (lib/profile-completeness.ts ProfileDataV2 + _count
                // relations). Without these, the dashboard's completeness
                // gauge under-counts and disagrees with the percentage the
                // user-menu dropdown shows (which queries /api/auth/profile
                // with the full shape).
                prisma.userProfile.findUnique({
                    where: { supabaseId: user.id },
                    select: {
                        firstName: true,
                        lastName: true,
                        role: true,
                        headline: true,
                        bio: true,
                        phone: true,
                        resumeUrl: true,
                        avatarUrl: true,
                        certifications: true,
                        licenseStates: true,
                        specialties: true,
                        skills: true,
                        yearsExperience: true,
                        preferredWorkMode: true,
                        preferredJobType: true,
                        openToOffers: true,
                        profileVisible: true,
                        // Address (Personal Info section in completeness)
                        addressLine1: true,
                        city: true,
                        state: true,
                        zipCode: true,
                        // Credentials
                        npiNumber: true,
                        deaNumber: true,
                        // Section scores read from these relation counts
                        _count: {
                            select: {
                                licenses: true,
                                certificationRecords: true,
                                education: true,
                                workExperience: true,
                                screeningAnswers: true,
                                openEndedResponses: true,
                                candidateReferences: true,
                            },
                        },
                    },
                }),

                // 2. Application count
                prisma.jobApplication.count({
                    where: { userId: user.id },
                }),

                // 3. Last 5 applications with job details
                prisma.jobApplication.findMany({
                    where: { userId: user.id },
                    orderBy: { appliedAt: 'desc' },
                    take: 5,
                    include: {
                        job: {
                            select: {
                                id: true,
                                title: true,
                                slug: true,
                                employer: true,
                                location: true,
                                jobType: true,
                                mode: true,
                                displaySalary: true,
                                isPublished: true,
                            },
                        },
                    },
                }),

                // 4. Active alerts count
                prisma.jobAlert.count({
                    where: {
                        email: { equals: user.email!, mode: 'insensitive' },
                        isActive: true,
                    },
                }),

                // 5. Saved jobs details (from localStorage IDs)
                savedJobIds.length > 0
                    ? prisma.job.findMany({
                        where: {
                            id: { in: savedJobIds },
                        },
                        orderBy: { createdAt: 'desc' },
                        take: 5,
                        select: {
                            id: true,
                            title: true,
                            slug: true,
                            employer: true,
                            location: true,
                            jobType: true,
                            mode: true,
                            displaySalary: true,
                            isPublished: true,
                        },
                    })
                    : Promise.resolve([]),

                // 6. Recommended jobs (matching preferences or most recent)
                getRecommendedJobs(user.id),

                // 7. Newsletter subscription status
                prisma.emailLead.findUnique({
                    where: { email: user.email! },
                    select: { newsletterOptIn: true },
                }),

                // 8. Unread messages count
                prisma.employerMessage.count({
                    where: {
                        recipientId: user.id,
                        readAt: null,
                    },
                }),
            ])

        // Note: dashboard is primarily for job seekers but accessible to all authenticated users

        return NextResponse.json({
            profile: {
                ...profile,
                newsletterOptIn: emailLead?.newsletterOptIn ?? false,
            },
            stats: {
                savedJobs: savedJobIds.length,
                applied: applicationCount,
                profileViews: 0, // placeholder — tracked in Slice 25
                activeAlerts: alertCount,
            },
            applications,
            savedJobs,
            recommendedJobs,
            unreadMessages: unreadMessages || 0,
        })
    } catch (error) {
        console.error('Dashboard API error:', error)
        return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 })
    }
}

/**
 * Fetch recommended jobs matching user preferences, or most recent.
 */
/** Hydrate raw Job rows into the dashboard recommendation shape (with built salary display). */
function hydrateForDashboard<T extends {
    id: string;
    displaySalary: string | null;
    salaryRange: string | null;
    normalizedMinSalary: number | null;
    normalizedMaxSalary: number | null;
    salaryPeriod: string | null;
    employerJobs: { companyLogoUrl: string | null } | null;
}>(jobs: T[]): Array<Omit<T, 'employerJobs' | 'salaryRange' | 'normalizedMinSalary' | 'normalizedMaxSalary' | 'salaryPeriod'> & { displaySalary: string | null; companyLogoUrl: string | null }> {
    return jobs.map((j) => {
        let salary = j.displaySalary;
        if (!salary) {
            const min = j.normalizedMinSalary;
            const max = j.normalizedMaxSalary;
            const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n.toLocaleString()}`;
            const period = j.salaryPeriod === 'hourly' ? '/hr' : '/yr';
            if (min && max && min !== max) salary = `${fmt(min)}-${fmt(max)}${period}`;
            else if (min) salary = `${fmt(min)}${period}`;
            else if (max) salary = `${fmt(max)}${period}`;
            else salary = j.salaryRange || null;
        }
        const { employerJobs, salaryRange: _r, normalizedMinSalary: _min, normalizedMaxSalary: _max, salaryPeriod: _p, ...rest } = j;
        void _r; void _min; void _max; void _p;
        return {
            ...rest,
            displaySalary: salary,
            companyLogoUrl: employerJobs?.companyLogoUrl ?? null,
        };
    });
}

// Mirror the columns the shared <JobCard> reads from a Job — letting the
// dashboard render the same card the /jobs page does. Selected here once
// so both AI and rule-based recommendation paths return the same shape.
const RECOMMENDATION_SELECT = {
    id: true,
    title: true,
    slug: true,
    employer: true,
    location: true,
    city: true,
    state: true,
    stateCode: true,
    country: true,
    jobType: true,
    mode: true,
    experienceLevel: true,
    // Phase 1 structured experience fields — JobCard's chip reads these.
    experienceLabel: true,
    newGradFriendly: true,
    description: true,
    descriptionSummary: true,
    displaySalary: true,
    salaryRange: true,
    minSalary: true,
    maxSalary: true,
    normalizedMinSalary: true,
    normalizedMaxSalary: true,
    salaryIsEstimated: true,
    salaryConfidence: true,
    salaryPeriod: true,
    isRemote: true,
    isHybrid: true,
    isPublished: true,
    createdAt: true,
    updatedAt: true,
    expiresAt: true,
    originalPostedAt: true,
    viewCount: true,
    applyClickCount: true,
    isFeatured: true,
    isVerifiedEmployer: true,
    applyLink: true,
    applyOnPlatform: true,
    sourceType: true,
    sourceProvider: true,
    sourceSite: true,
    externalId: true,
    companyId: true,
    employerJobs: { select: { companyLogoUrl: true } },
} as const;

/**
 * Try the AI recommendations table first (populated by the daily Inngest cron
 * in lib/inngest/functions/recommendations.ts, behind feature flag
 * `ai.candidate.recommendations`). When the flag is off, the candidate has no
 * embedding yet, or the cron hasn't run for them, returns null and the caller
 * falls back to the rule-based heuristic below.
 */
async function getAiRecommendedJobs(userId: string, appliedJobIds: ReadonlyArray<string>) {
    const tenant = { type: 'candidate' as const, id: userId };
    const enabled = await isAiFeatureEnabled('ai.candidate.recommendations', tenant);
    if (!enabled) return null;

    const latest = await prisma.candidateRecommendation.findFirst({
        where: { supabaseId: userId, dismissedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { batchId: true },
    });
    if (!latest) return null;

    const recs = await prisma.candidateRecommendation.findMany({
        where: {
            supabaseId: userId,
            batchId: latest.batchId,
            dismissedAt: null,
            ...(appliedJobIds.length > 0 ? { jobId: { notIn: appliedJobIds as string[] } } : {}),
        },
        // The cron persists rows in tier-pinned display order via `rank`,
        // so we just walk the rank order to render Easy/Direct/External
        // grouped correctly without re-sorting on the client.
        orderBy: { rank: 'asc' },
        take: 8,
        include: { job: { select: RECOMMENDATION_SELECT } },
    });
    if (recs.length === 0) return null;

    // Hydrate the Job rows AND attach the persisted tier so the dashboard
    // can render the Easy Apply / Direct Apply / Open badge per card.
    const hydrated = hydrateForDashboard(recs.map((r) => r.job));
    return hydrated.map((j, i) => ({ ...j, recommendationTier: recs[i].tier as 'easy_apply' | 'direct_apply' | 'external' }));
}

async function getRecommendedJobs(userId: string) {
    // Already-applied filter is shared by both AI and rule-based paths so the
    // user never sees "applied"jobs in their recommendations panel.
    const appliedJobIds = (await prisma.jobApplication.findMany({
        where: { userId },
        select: { jobId: true },
    })).map((a) => a.jobId);

    // Try AI recommendations first.
    const aiRecs = await getAiRecommendedJobs(userId, appliedJobIds);
    if (aiRecs) return aiRecs;

    // ── Rule-based fallback (preferences + recency, exclude already-applied) ──
    const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: userId },
        select: {
            preferredWorkMode: true,
            preferredJobType: true,
            licenseStates: true,
        },
    })

    // Build filter conditions based on user preferences
    const where: Record<string, unknown> = { isPublished: true }
    const hasPrefs = profile?.preferredWorkMode || profile?.preferredJobType || profile?.licenseStates

    if (hasPrefs) {
        const orConditions: Record<string, unknown>[] = []

        if (profile?.preferredWorkMode) {
            const mode = profile.preferredWorkMode
            if (mode === 'Remote') orConditions.push({ isRemote: true })
            else if (mode === 'Hybrid') orConditions.push({ isHybrid: true })
            else if (mode !== 'Any') orConditions.push({ mode })
        }

        if (profile?.preferredJobType && profile.preferredJobType !== 'Any') {
            orConditions.push({ jobType: profile.preferredJobType })
        }

        if (profile?.licenseStates) {
            const states = profile.licenseStates.split(',').map(s => s.trim()).filter(Boolean)
            if (states.length > 0) {
                orConditions.push({ stateCode: { in: states } })
            }
        }

        if (orConditions.length > 0) {
            where.OR = orConditions
        }
    }

    if (appliedJobIds.length > 0) {
        where.id = { notIn: appliedJobIds }
    }

    const jobs = await prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: RECOMMENDATION_SELECT,
    });
    return hydrateForDashboard(jobs);
}
