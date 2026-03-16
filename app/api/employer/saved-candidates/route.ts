import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/employer/saved-candidates
 * List all saved candidates for the authenticated employer.
 */
export async function GET() {
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

    const saved = await prisma.savedCandidate.findMany({
        where: { employerId: profile.id },
        include: {
            candidate: {
                select: {
                    id: true,
                    supabaseId: true,
                    firstName: true,
                    lastName: true,
                    avatarUrl: true,
                    headline: true,
                    yearsExperience: true,
                    certifications: true,
                    licenseStates: true,
                    specialties: true,
                    preferredWorkMode: true,
                    availableDate: true,
                    resumeUrl: true,
                },
            },
        },
        orderBy: { savedAt: 'desc' },
    });

    const formatted = saved.map((s) => ({
        id: s.id,
        note: s.note,
        savedAt: s.savedAt.toISOString(),
        candidate: {
            id: s.candidate.supabaseId,
            displayName: [s.candidate.firstName, s.candidate.lastName?.[0] ? s.candidate.lastName[0] + '.' : null].filter(Boolean).join(' ') || 'PMHNP Candidate',
            initials: `${(s.candidate.firstName || 'P').charAt(0)}${(s.candidate.lastName || 'C').charAt(0)}`.toUpperCase(),
            avatarUrl: s.candidate.avatarUrl,
            headline: s.candidate.headline,
            yearsExperience: s.candidate.yearsExperience,
            certifications: s.candidate.certifications ? s.candidate.certifications.split(',').map((c: string) => c.trim()) : [],
            licenseStates: s.candidate.licenseStates ? s.candidate.licenseStates.split(',').map((s: string) => s.trim()) : [],
            specialties: s.candidate.specialties ? s.candidate.specialties.split(',').map((s: string) => s.trim()) : [],
            preferredWorkMode: s.candidate.preferredWorkMode,
            availableDate: s.candidate.availableDate?.toISOString() || null,
            hasResume: !!s.candidate.resumeUrl,
        },
    }));

    return NextResponse.json({ savedCandidates: formatted });
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
    const { candidateId, note } = body;

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

    // Upsert to avoid duplicates
    const saved = await prisma.savedCandidate.upsert({
        where: {
            employerId_candidateId: {
                employerId: profile.id,
                candidateId: candidate.id,
            },
        },
        update: { note: note || null },
        create: {
            employerId: profile.id,
            candidateId: candidate.id,
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
    const { candidateId } = body;

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
        },
    });

    return NextResponse.json({ success: true });
}
