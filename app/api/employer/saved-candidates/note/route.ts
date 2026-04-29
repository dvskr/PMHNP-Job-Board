import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/**
 * PATCH /api/employer/saved-candidates/note
 * Update note and/or tags on a saved candidate.
 * Body: { candidateId: string, postingId?: string, note?: string, tags?: string[] }
 */
export async function PATCH(req: NextRequest) {
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
    const { candidateId, postingId, note, tags } = body;

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

    // Find the saved record
    const saved = await prisma.savedCandidate.findFirst({
        where: {
            employerId: profile.id,
            candidateId: candidate.id,
            employerJobId: postingId || null,
        },
    });

    if (!saved) {
        return NextResponse.json({ error: 'Candidate not saved' }, { status: 404 });
    }

    // Build update payload
    const updateData: { note?: string | null; tags?: string[] } = {};
    if (note !== undefined) updateData.note = note || null;
    if (tags !== undefined) updateData.tags = tags;

    const updated = await prisma.savedCandidate.update({
        where: { id: saved.id },
        data: updateData,
    });

    return NextResponse.json({ success: true, note: updated.note, tags: updated.tags });
}
