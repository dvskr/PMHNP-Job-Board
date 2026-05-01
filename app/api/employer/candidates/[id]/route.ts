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

    // Check if this candidate was already unlocked (ProfileView exists)
    const existingView = await prisma.profileView.findUnique({
        where: {
            viewerId_candidateId: {
                viewerId: user.id,
                candidateId: id,
            },
        },
    })

    // Full access if: admin, OR has active posting, OR already unlocked this candidate
    const hasFullAccess = isAdmin || !!existingView || await hasActiveFeaturedPost(user.id)

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

    let chargePostingId: string | undefined

    if (!existingView && !isAdmin) {
        // This is a new unlock — check per-posting credit pool
        const tier = await getEmployerTier(user.id)
        const unlockCheck = await canUnlockCandidate(user.id, tier)
        if (!unlockCheck.allowed) {
            return NextResponse.json({
                error: 'Candidate unlock limit reached for this posting',
                used: unlockCheck.used,
                limit: unlockCheck.limit,
                tier,
                upgradeRequired: true,
            }, { status: 403 })
        }
        chargePostingId = unlockCheck.postingId
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
                employerJobId: chargePostingId || null,
            },
        })
    } catch {
        // Don't fail the request if view tracking fails
    }

    // Tier is informational only (always 'pro' in single-tier model). Real gates
    // are isAdmin (admin-only fields) and hasFullAccess (unlock-gated fields).
    const tier: PricingTier = await getEmployerTier(user.id)

    // Privacy: full last name only for admins; everyone else sees first-initial only.
    const displayName = candidate.firstName
        ? `${candidate.firstName} ${isAdmin && candidate.lastName ? candidate.lastName : (candidate.lastName ? candidate.lastName.charAt(0) + '.' : '')}`.trim()
        : 'PMHNP Candidate'

    // Base fields — everyone sees these
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: Record<string, any> = {
        id: candidate.supabaseId,
        displayName,
        initials: `${(candidate.firstName || 'P').charAt(0)}${(candidate.lastName || 'C').charAt(0)}`.toUpperCase(),
        avatarUrl: candidate.avatarUrl,
        headline: candidate.headline,
        yearsExperience: candidate.yearsExperience,
        specialties: candidate.specialties ? candidate.specialties.split(',').map(s => s.trim()) : [],
        preferredWorkMode: candidate.preferredWorkMode,
        joinedAt: candidate.createdAt.toISOString(),
        tier,
        hasFullAccess,
    }

    // Unlock-gated fields — certifications, license, salary, availability.
    // Same gate as contact info (hasFullAccess) so the response is consistent.
    if (hasFullAccess) {
        response.certifications = candidate.certifications ? candidate.certifications.split(',').map(s => s.trim()) : []
        response.licenseStates = candidate.licenseStates ? candidate.licenseStates.split(',').map(s => s.trim()) : []
        response.availableDate = candidate.availableDate?.toISOString() || null
        response.hasResume = !!candidate.resumeUrl

        // Salary range — never show exact, round to nearest 5k
        if (candidate.desiredSalaryMin || candidate.desiredSalaryMax) {
            const roundTo5k = (n: number) => Math.round(n / 5000) * 5000
            const min = candidate.desiredSalaryMin ? roundTo5k(candidate.desiredSalaryMin) : null
            const max = candidate.desiredSalaryMax ? roundTo5k(candidate.desiredSalaryMax) : null
            if (min && max) {
                response.salaryRange = `$${(min / 1000).toFixed(0)}k – $${(max / 1000).toFixed(0)}k`
            } else if (min) {
                response.salaryRange = `$${(min / 1000).toFixed(0)}k+`
            } else if (max) {
                response.salaryRange = `Up to $${(max / 1000).toFixed(0)}k`
            }
        }
    }

    // Admin-only fields — bio, job type preference
    if (isAdmin) {
        response.bio = candidate.bio
        response.preferredJobType = candidate.preferredJobType
    }

    // hasFullAccess fields — resume download, email, LinkedIn (unchanged)
    const freshResumeUrl = hasFullAccess ? await generateResumeUrl(candidate.resumeUrl) : null
    response.resumeUrl = freshResumeUrl
    response.contactEmail = hasFullAccess ? candidate.email : null
    response.linkedinUrl = hasFullAccess ? candidate.linkedinUrl : null

    return NextResponse.json(response)
}
