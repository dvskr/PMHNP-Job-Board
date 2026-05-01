import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { getEmployerTier, getEmployerActivePostings } from '@/lib/tier-limits';
import { PricingTier } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * GET /api/employer/saved-candidates
 * List all saved candidates for the authenticated employer.
 * Fields are tier-gated to match the candidate search API.
 */
export async function GET(req: NextRequest) {
    const rateLimitResponse = await rateLimit(req, 'employer:saved-candidates', RATE_LIMITS.employer);
    if (rateLimitResponse) return rateLimitResponse;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id },
        select: { id: true, role: true },
    });

    if (!profile || !['employer', 'admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Real gates: isAdmin (admin-only fields) and hasActivePosting (unlock-eligible
    // metadata). Tier value is informational only in the single-tier model.
    const isAdmin = profile.role === 'admin';
    const tier: PricingTier = await getEmployerTier(user.id);
    const hasActivePosting = isAdmin
        ? true
        : (await getEmployerActivePostings(user.id)).length > 0;

    // Starter fields (always included)
    const candidateSelect: Record<string, boolean> = {
        id: true,
        supabaseId: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        headline: true,
        yearsExperience: true,
        specialties: true,
        preferredWorkMode: true,
    };

    // Active-posting fields — unlock-eligible metadata
    if (hasActivePosting) {
        candidateSelect.certifications = true;
        candidateSelect.licenseStates = true;
        candidateSelect.desiredSalaryMin = true;
        candidateSelect.desiredSalaryMax = true;
        candidateSelect.desiredSalaryType = true;
        candidateSelect.availableDate = true;
        candidateSelect.resumeUrl = true;
    }

    // Admin-only fields
    if (isAdmin) {
        candidateSelect.bio = true;
        candidateSelect.preferredJobType = true;
        candidateSelect.state = true;
        candidateSelect.city = true;
    }

    // Filter by posting if specified
    const postingId = req.nextUrl.searchParams.get('postingId');
    const whereClause: Record<string, unknown> = { employerId: profile.id };
    if (postingId) {
        whereClause.employerJobId = postingId;
    }

    const saved = await prisma.savedCandidate.findMany({
        where: whereClause,
        include: {
            candidate: {
                select: candidateSelect,
            },
            employerJob: {
                select: { id: true, jobId: true, pricingTier: true, job: { select: { title: true } } },
            },
        },
        orderBy: { savedAt: 'desc' },
    });

    // Also fetch which candidates this employer has unlocked (viewed)
    const viewedProfiles = await prisma.profileView.findMany({
        where: { viewerId: user.id },
        select: { candidateId: true },
    });
    const viewedCandidateIds = viewedProfiles.map(v => v.candidateId);

    const formatted = saved.map((s) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = s.candidate as any;

        const base: Record<string, unknown> = {
            id: c.supabaseId,
            displayName: c.firstName
                ? `${c.firstName} ${isAdmin && c.lastName ? c.lastName : (c.lastName ? c.lastName.charAt(0) + '.' : '')}`.trim()
                : 'PMHNP Candidate',
            initials: `${(c.firstName || 'P').charAt(0)}${(c.lastName || 'C').charAt(0)}`.toUpperCase(),
            avatarUrl: c.avatarUrl,
            headline: c.headline,
            yearsExperience: c.yearsExperience,
            specialties: c.specialties ? c.specialties.split(',').map((s: string) => s.trim()) : [],
            preferredWorkMode: c.preferredWorkMode,
        };

        // Active-posting fields
        if (hasActivePosting) {
            base.certifications = c.certifications ? c.certifications.split(',').map((s: string) => s.trim()) : [];
            base.licenseStates = c.licenseStates ? c.licenseStates.split(',').map((s: string) => s.trim()) : [];
            base.desiredSalaryMin = c.desiredSalaryMin;
            base.desiredSalaryMax = c.desiredSalaryMax;
            base.desiredSalaryType = c.desiredSalaryType;
            base.availableDate = c.availableDate?.toISOString() || null;
            base.hasResume = !!c.resumeUrl;
        }

        // Admin-only fields
        if (isAdmin) {
            base.bio = c.bio;
            base.preferredJobType = c.preferredJobType;
            base.state = c.state;
            base.city = c.city;
        }

        return {
            id: s.id,
            note: s.note,
            tags: s.tags || [],
            savedAt: s.savedAt.toISOString(),
            postingId: s.employerJobId || null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            postingTitle: (s as any).employerJob?.job?.title || null,
            candidate: base,
        };
    });

    return NextResponse.json({ savedCandidates: formatted, tier, viewedCandidateIds });
}

/**
 * POST /api/employer/saved-candidates
 * Save a candidate. Body: { candidateId: string, note?: string }
 */
export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id },
        select: { id: true, role: true },
    });

    if (!profile || !['employer', 'admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { candidateId, note, postingId } = body;

    if (!candidateId) {
        return NextResponse.json({ error: 'candidateId is required' }, { status: 400 });
    }

    // Look up candidate by supabaseId
    const candidate = await prisma.userProfile.findUnique({
        where: { supabaseId: candidateId },
        select: { id: true },
    });

    if (!candidate) {
        return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // Upsert: compound unique on [employerId, candidateId, employerJobId]
    const saved = await prisma.savedCandidate.upsert({
        where: {
            employerId_candidateId_employerJobId: {
                employerId: profile.id,
                candidateId: candidate.id,
                employerJobId: postingId || null,
            },
        },
        update: { note: note || null },
        create: {
            employerId: profile.id,
            candidateId: candidate.id,
            employerJobId: postingId || null,
            note: note || null,
        },
    });

    return NextResponse.json({ success: true, id: saved.id }, { status: 201 });
}

/**
 * DELETE /api/employer/saved-candidates
 * Unsave a candidate. Body: { candidateId: string }
 */
export async function DELETE(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id },
        select: { id: true, role: true },
    });

    if (!profile || !['employer', 'admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { candidateId, postingId } = body;

    if (!candidateId) {
        return NextResponse.json({ error: 'candidateId is required' }, { status: 400 });
    }

    // Look up candidate by supabaseId
    const candidate = await prisma.userProfile.findUnique({
        where: { supabaseId: candidateId },
        select: { id: true },
    });

    if (!candidate) {
        return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    await prisma.savedCandidate.deleteMany({
        where: {
            employerId: profile.id,
            candidateId: candidate.id,
            employerJobId: postingId || null,
        },
    });

    return NextResponse.json({ success: true });
}
