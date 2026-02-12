import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params

    // Auth check — employer or admin only
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const viewerProfile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id },
        select: { role: true },
    })

    if (!viewerProfile || !['employer', 'admin'].includes(viewerProfile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch candidate (privacy check: must be visible + open to offers)
    const candidate = await prisma.userProfile.findFirst({
        where: {
            supabaseId: id,
            profileVisible: true,
            openToOffers: true,
            role: 'job_seeker',
        },
    })

    if (!candidate) {
        return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    }

    // Track profile view (upsert — one record per viewer+candidate pair)
    try {
        await prisma.profileView.upsert({
            where: {
                viewerId_candidateId: {
                    viewerId: user.id,
                    candidateId: id,
                },
            },
            update: { viewedAt: new Date() },
            create: {
                viewerId: user.id,
                candidateId: id,
            },
        })
    } catch {
        // Don't fail the request if view tracking fails
    }

    // Build response with privacy transforms
    const displayName = candidate.firstName
        ? `${candidate.firstName} ${candidate.lastName ? candidate.lastName.charAt(0) + '.' : ''}`.trim()
        : 'PMHNP Candidate'

    // Salary range — never show exact, round to nearest 5k
    let salaryRange: string | null = null
    if (candidate.desiredSalaryMin || candidate.desiredSalaryMax) {
        const roundTo5k = (n: number) => Math.round(n / 5000) * 5000
        const min = candidate.desiredSalaryMin ? roundTo5k(candidate.desiredSalaryMin) : null
        const max = candidate.desiredSalaryMax ? roundTo5k(candidate.desiredSalaryMax) : null
        if (min && max) {
            salaryRange = `$${(min / 1000).toFixed(0)}k – $${(max / 1000).toFixed(0)}k`
        } else if (min) {
            salaryRange = `$${(min / 1000).toFixed(0)}k+`
        } else if (max) {
            salaryRange = `Up to $${(max / 1000).toFixed(0)}k`
        }
    }

    return NextResponse.json({
        id: candidate.supabaseId,
        displayName,
        initials: `${(candidate.firstName || 'P').charAt(0)}${(candidate.lastName || 'C').charAt(0)}`.toUpperCase(),
        avatarUrl: candidate.avatarUrl,
        headline: candidate.headline,
        bio: candidate.bio,
        yearsExperience: candidate.yearsExperience,
        certifications: candidate.certifications ? candidate.certifications.split(',').map(s => s.trim()) : [],
        licenseStates: candidate.licenseStates ? candidate.licenseStates.split(',').map(s => s.trim()) : [],
        specialties: candidate.specialties ? candidate.specialties.split(',').map(s => s.trim()) : [],
        preferredWorkMode: candidate.preferredWorkMode,
        preferredJobType: candidate.preferredJobType,
        availableDate: candidate.availableDate?.toISOString() || null,
        salaryRange,
        hasResume: !!candidate.resumeUrl,
        linkedinUrl: candidate.linkedinUrl,
        joinedAt: candidate.createdAt.toISOString(),

        // TODO: Gate behind paid plan — these fields should be hidden for free-tier employers
        contactEmail: candidate.email,
        resumeUrl: candidate.resumeUrl,
    })
}
