import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { getEmployerTier } from '@/lib/tier-limits'
import { PricingTier } from '@/lib/config'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
    // Rate limit + Auth check — employer or admin only
    const rateLimitResponse = await rateLimit(req, 'employer:candidates', RATE_LIMITS.employer)
    if (rateLimitResponse) return rateLimitResponse

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id },
        select: { role: true },
    })

    if (!profile || !['employer', 'admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Determine access tier from employer's best active posting
    const isAdmin = profile.role === 'admin'
    const tier: PricingTier = isAdmin ? 'premium' : await getEmployerTier(user.id)

    // Parse query params
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim() || ''
    const experience = searchParams.get('experience') // e.g. "3" for 3+ years
    const specialties = searchParams.get('specialties') // comma-separated
    const states = searchParams.get('states') // comma-separated
    const workMode = searchParams.get('workMode')
    const hasResume = searchParams.get('hasResume') // "true" or "false"
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')))
    const skip = (page - 1) * limit

    // Build WHERE clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
        profileVisible: true,
        openToOffers: true,
        role: 'job_seeker',
    }

    // Text search: match against firstName, lastName, headline, specialties, certifications
    if (q) {
        where.OR = [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { headline: { contains: q, mode: 'insensitive' } },
            { specialties: { contains: q, mode: 'insensitive' } },
            { certifications: { contains: q, mode: 'insensitive' } },
        ]
    }

    // Experience filter (minimum years)
    if (experience) {
        const minYears = parseInt(experience)
        if (!isNaN(minYears)) {
            where.yearsExperience = { gte: minYears }
        }
    }

    // Specialties filter (any match)
    if (specialties) {
        const specList = specialties.split(',').map(s => s.trim()).filter(Boolean)
        if (specList.length > 0) {
            where.AND = [
                ...(where.AND || []),
                {
                    OR: specList.map(s => ({
                        specialties: { contains: s, mode: 'insensitive' as const },
                    })),
                },
            ]
        }
    }

    // Licensed states filter (any match)
    if (states) {
        const stateList = states.split(',').map(s => s.trim()).filter(Boolean)
        if (stateList.length > 0) {
            where.AND = [
                ...(where.AND || []),
                {
                    OR: stateList.map(s => ({
                        licenseStates: { contains: s, mode: 'insensitive' as const },
                    })),
                },
            ]
        }
    }

    // Work mode filter
    if (workMode) {
        where.preferredWorkMode = { contains: workMode, mode: 'insensitive' }
    }

    // Has resume filter
    if (hasResume === 'true') {
        where.resumeUrl = { not: null }
    } else if (hasResume === 'false') {
        where.resumeUrl = null
    }

    // ── Tier-based field selection ──
    // Starter: basic info only
    const starterSelect = {
        id: true,
        supabaseId: true,
        firstName: true,
        lastName: true,
        headline: true,
        yearsExperience: true,
        specialties: true,
        preferredWorkMode: true,
        avatarUrl: true,
        createdAt: true,
    }

    // Growth: add license, certifications, salary, availability
    const growthSelect = {
        ...starterSelect,
        certifications: true,
        licenseStates: true,
        desiredSalaryMin: true,
        desiredSalaryMax: true,
        desiredSalaryType: true,
        availableDate: true,
        resumeUrl: true,
    }

    // Premium: full access including bio, join date, etc.
    const premiumSelect = {
        ...growthSelect,
        bio: true,
        preferredJobType: true,
        state: true,
        city: true,
    }

    const select = tier === 'premium' ? premiumSelect
        : tier === 'growth' ? growthSelect
        : starterSelect

    // Query + fetch viewed candidates in parallel
    const [candidates, totalCount, viewedProfiles] = await Promise.all([
        prisma.userProfile.findMany({
            where,
            select,
            orderBy: { updatedAt: 'desc' },
            skip,
            take: limit,
        }),
        prisma.userProfile.count({ where }),
        prisma.profileView.findMany({
            where: { viewerId: user.id },
            select: { candidateId: true },
        }),
    ])

    const viewedCandidateIds = viewedProfiles.map(v => v.candidateId)

    // Privacy transform: mask last name for non-premium tiers
    const results = candidates.map(c => {
        const base = {
            id: c.supabaseId,
            displayName: c.firstName
                ? `${c.firstName} ${tier === 'premium' && c.lastName ? c.lastName : (c.lastName ? c.lastName.charAt(0) + '.' : '')}`.trim()
                : 'PMHNP Candidate',
            headline: c.headline,
            yearsExperience: c.yearsExperience,
            specialties: c.specialties ? c.specialties.split(',').map(s => s.trim()) : [],
            preferredWorkMode: c.preferredWorkMode,
            avatarUrl: c.avatarUrl,
            initials: `${(c.firstName || 'P').charAt(0)}${(c.lastName || 'C').charAt(0)}`.toUpperCase(),
            joinedAt: c.createdAt.toISOString(),
        }

        // Growth fields
        if (tier === 'growth' || tier === 'premium') {
            const growthData = c as typeof c & {
                certifications?: string | null;
                licenseStates?: string | null;
                desiredSalaryMin?: number | null;
                desiredSalaryMax?: number | null;
                desiredSalaryType?: string | null;
                availableDate?: Date | null;
                resumeUrl?: string | null;
            }
            Object.assign(base, {
                certifications: growthData.certifications ? growthData.certifications.split(',').map(s => s.trim()) : [],
                licenseStates: growthData.licenseStates ? growthData.licenseStates.split(',').map(s => s.trim()) : [],
                desiredSalaryMin: growthData.desiredSalaryMin,
                desiredSalaryMax: growthData.desiredSalaryMax,
                desiredSalaryType: growthData.desiredSalaryType,
                availableDate: growthData.availableDate?.toISOString() || null,
                hasResume: !!growthData.resumeUrl,
            })
        }

        // Premium fields
        if (tier === 'premium') {
            const premiumData = c as typeof c & {
                bio?: string | null;
                preferredJobType?: string | null;
                state?: string | null;
                city?: string | null;
            }
            Object.assign(base, {
                bio: premiumData.bio,
                preferredJobType: premiumData.preferredJobType,
                state: premiumData.state,
                city: premiumData.city,
            })
        }

        return base
    })

    return NextResponse.json({
        candidates: results,
        totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit),
        tier,
        viewedCandidateIds,
    })
}
