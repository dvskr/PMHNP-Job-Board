import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'

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
        const [profile, applicationCount, applications, alertCount, savedJobs, recommendedJobs, emailLead] =
            await Promise.all([
                // 1. User profile
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
                        yearsExperience: true,
                        preferredWorkMode: true,
                        preferredJobType: true,
                        openToOffers: true,
                        profileVisible: true,
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
                        email: user.email!,
                        isActive: true,
                    },
                }),

                // 5. Saved jobs details (from localStorage IDs)
                savedJobIds.length > 0
                    ? prisma.job.findMany({
                        where: {
                            id: { in: savedJobIds },
                            isPublished: true,
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
        })
    } catch (error) {
        console.error('Dashboard API error:', error)
        return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 })
    }
}

/**
 * Fetch recommended jobs matching user preferences, or most recent.
 */
async function getRecommendedJobs(userId: string) {
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

    // Exclude jobs user already applied to
    const appliedJobIds = await prisma.jobApplication.findMany({
        where: { userId },
        select: { jobId: true },
    })
    if (appliedJobIds.length > 0) {
        where.id = { notIn: appliedJobIds.map(a => a.jobId) }
    }

    return prisma.job.findMany({
        where,
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
            isRemote: true,
        },
    })
}
