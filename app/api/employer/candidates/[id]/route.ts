import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { canUnlockCandidate, getEmployerTier } from '@/lib/tier-limits'
import { PricingTier } from '@/lib/config'

/**
 * Generate a fresh signed URL for a resume stored as a storage path.
 * Handles both legacy full URLs and new storage paths.
 */
async function generateResumeUrl(resumeUrl: string | null): Promise<string | null> {
    if (!resumeUrl) return null;

    // If it's already a full URL (legacy data), return as-is
    if (resumeUrl.startsWith('http')) return resumeUrl;

    // It's a storage path — generate a fresh signed URL
    try {
        const admin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { data } = await admin.storage
            .from('resumes')
            .createSignedUrl(resumeUrl, 3600); // 1 hour
        return data?.signedUrl || null;
    } catch {
        return null;
    }
}

/**
 * Check whether an employer has at least one active FEATURED job posting.
 * Featured posts unlock full candidate profile access (contact, resume, LinkedIn).
 * Works for both paid and free-mode featured posts.
 * "active" means the related Job.expiresAt > now.
 */
async function hasActiveFeaturedPost(supabaseId: string): Promise<boolean> {
    const count = await prisma.employerJob.count({
        where: {
            userId: supabaseId,
            job: {
                isFeatured: true,
                isPublished: true,
                expiresAt: { gt: new Date() },
            },
        },
    })
    return count > 0
}

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

    if (!viewerProfile || (viewerProfile.role !== 'employer' && viewerProfile.role !== 'admin')) {
        return NextResponse.json({ error: 'Forbidden — employer or admin only' }, { status: 403 })
    }

    // Determine access level: admin always gets full access,
    // employers need an active paid job post for full candidate info
    const isAdmin = viewerProfile.role === 'admin'
    const hasFullAccess = isAdmin || await hasActiveFeaturedPost(user.id)

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
    // Check if this is a NEW unlock (not a re-view of an already-unlocked candidate)
    const existingView = await prisma.profileView.findUnique({
        where: {
            viewerId_candidateId: {
                viewerId: user.id,
                candidateId: id,
            },
        },
    })

    if (!existingView && !isAdmin) {
        // This is a new unlock — check monthly limit
        const tier = await getEmployerTier(user.id)
        const unlockCheck = await canUnlockCandidate(user.id, tier)
        if (!unlockCheck.allowed) {
            return NextResponse.json({
                error: 'Monthly candidate unlock limit reached',
                used: unlockCheck.used,
                limit: unlockCheck.limit,
                tier,
                upgradeRequired: true,
            }, { status: 403 })
        }
    }

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

    // Resume + contact details — ONLY available with an active paid featured job post
    const freshResumeUrl = hasFullAccess ? await generateResumeUrl(candidate.resumeUrl) : null;

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
        joinedAt: candidate.createdAt.toISOString(),

        // Paid access only — resume, email, LinkedIn
        hasFullAccess,
        resumeUrl: freshResumeUrl,
        contactEmail: hasFullAccess ? candidate.email : null,
        linkedinUrl: hasFullAccess ? candidate.linkedinUrl : null,
    })
}
