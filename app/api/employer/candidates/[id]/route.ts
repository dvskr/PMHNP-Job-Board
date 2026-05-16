import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { canUnlockCandidate, getEmployerTier } from '@/lib/tier-limits'
import { PricingTier } from '@/lib/config'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { mintResumeReadUrl, extractRequestContext } from '@/lib/resume-storage'

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
    // Rate limiting — without this, an authenticated employer could mass-scrape
    // candidate profiles by enumerating IDs. Same bucket as the list endpoint.
    const rateLimitResult = await rateLimit(req, 'employer:candidate-detail', RATE_LIMITS.employer)
    if (rateLimitResult) return rateLimitResult

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
        // This is a new unlock — check per-posting credit pool + daily cap
        const tier = await getEmployerTier(user.id)
        const unlockCheck = await canUnlockCandidate(user.id, tier)
        if (!unlockCheck.allowed) {
            // Branch the message by reason — daily cap means "come back tomorrow",
            // posting cap means "buy another posting", no posting means "post first".
            const messages: Record<string, string> = {
                daily_cap: `Daily unlock cap reached (${unlockCheck.limit} per 24h). This is an anti-scrape safety limit — try again tomorrow.`,
                posting_cap: 'Candidate unlock limit reached for your active postings.',
                no_posting: 'You need at least one active job posting to unlock candidates.',
            };
            const reason = unlockCheck.reason || 'posting_cap';
            return NextResponse.json({
                error: messages[reason] || messages.posting_cap,
                reason,
                used: unlockCheck.used,
                limit: unlockCheck.limit,
                tier,
                upgradeRequired: reason === 'posting_cap',
            }, { status: 403 })
        }

        // 2026-05-15: prefer the client's selected posting (?postingId=) so
        // the unlock debits the posting the employer is watching on the
        // talent-pool counter. Without this, canUnlockCandidate picks
        // "newest active posting with headroom" — typically a different
        // posting — and the visible counter never moves even though the
        // unlock succeeded.
        //
        // Security guard: only honor a postingId that's actually owned by
        // this employer AND currently active. Otherwise fall through to
        // the auto-picker — never trust a client-supplied posting id
        // unverified.
        const requestedPostingId = req.nextUrl.searchParams.get('postingId') || null;
        if (requestedPostingId) {
            const ownsPosting = await prisma.employerJob.findFirst({
                where: {
                    id: requestedPostingId,
                    OR: [
                        { userId: user.id },
                        { contactEmail: user.email ?? '' },
                    ],
                    job: { isPublished: true, expiresAt: { gt: new Date() } },
                },
                select: { id: true },
            });
            chargePostingId = ownsPosting ? requestedPostingId : unlockCheck.postingId;
        } else {
            chargePostingId = unlockCheck.postingId;
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

    // hasFullAccess fields — resume download, email, LinkedIn (unchanged).
    // Resume URL goes through the centralized minter for audit logging
    // and 15-min default TTL.
    const freshResumeUrl = hasFullAccess
        ? await mintResumeReadUrl(candidate.resumeUrl, {
              actorId: user.id,
              ownerId: id,
              audience: isAdmin ? 'admin' : 'employer',
              action: 'view',
              ...extractRequestContext(req),
              reason: 'employer candidate detail page',
          })
        : null
    response.resumeUrl = freshResumeUrl
    response.contactEmail = hasFullAccess ? candidate.email : null
    response.linkedinUrl = hasFullAccess ? candidate.linkedinUrl : null

    return NextResponse.json(response)
}
