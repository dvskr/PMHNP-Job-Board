import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
    // Auth check — employer or admin only
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

    // Query
    const [candidates, totalCount] = await Promise.all([
        prisma.userProfile.findMany({
            where,
            select: {
                id: true,
                supabaseId: true,
                firstName: true,
                lastName: true,
                headline: true,
                yearsExperience: true,
                certifications: true,
                licenseStates: true,
                specialties: true,
                preferredWorkMode: true,
                availableDate: true,
                resumeUrl: true,
                avatarUrl: true,
                bio: true,
                createdAt: true,
            },
            orderBy: { updatedAt: 'desc' },
            skip,
            take: limit,
        }),
        prisma.userProfile.count({ where }),
    ])

    // Privacy transform: first name + last initial, no email/phone/resumeUrl value
    const results = candidates.map(c => ({
        id: c.supabaseId,
        displayName: c.firstName
            ? `${c.firstName} ${c.lastName ? c.lastName.charAt(0) + '.' : ''}`.trim()
            : 'PMHNP Candidate',
        headline: c.headline,
        yearsExperience: c.yearsExperience,
        certifications: c.certifications ? c.certifications.split(',').map(s => s.trim()) : [],
        licenseStates: c.licenseStates ? c.licenseStates.split(',').map(s => s.trim()) : [],
        specialties: c.specialties ? c.specialties.split(',').map(s => s.trim()) : [],
        preferredWorkMode: c.preferredWorkMode,
        availableDate: c.availableDate?.toISOString() || null,
        hasResume: !!c.resumeUrl,
        avatarUrl: c.avatarUrl,
        initials: `${(c.firstName || 'P').charAt(0)}${(c.lastName || 'C').charAt(0)}`.toUpperCase(),
        joinedAt: c.createdAt.toISOString(),
    }))

    return NextResponse.json({
        candidates: results,
        totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit),
    })
}
