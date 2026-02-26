import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/employer/candidate-alerts
 * Fetch alert preferences for the authenticated employer.
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

    const alert = await prisma.employerCandidateAlert.findFirst({
        where: { employerId: profile.id },
    });

    return NextResponse.json({
        alert: alert ? {
            id: alert.id,
            specialties: alert.specialties ? alert.specialties.split(',').map(s => s.trim()) : [],
            states: alert.states ? alert.states.split(',').map(s => s.trim()) : [],
            minExperience: alert.minExperience,
            workMode: alert.workMode,
            isActive: alert.isActive,
        } : null,
    });
}

/**
 * POST /api/employer/candidate-alerts
 * Create or update alert preferences.
 * Body: { specialties?: string[], states?: string[], minExperience?: number, workMode?: string, isActive?: boolean }
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
    const { specialties, states, minExperience, workMode, isActive } = body;

    const data = {
        specialties: specialties?.length ? specialties.join(',') : null,
        states: states?.length ? states.join(',') : null,
        minExperience: minExperience ?? null,
        workMode: workMode || null,
        isActive: isActive ?? true,
    };

    // Upsert: find existing or create new
    const existing = await prisma.employerCandidateAlert.findFirst({
        where: { employerId: profile.id },
    });

    if (existing) {
        await prisma.employerCandidateAlert.update({
            where: { id: existing.id },
            data,
        });
    } else {
        await prisma.employerCandidateAlert.create({
            data: {
                employerId: profile.id,
                ...data,
            },
        });
    }

    return NextResponse.json({ success: true });
}

/**
 * DELETE /api/employer/candidate-alerts
 * Disable alerts for this employer.
 */
export async function DELETE() {
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

    await prisma.employerCandidateAlert.updateMany({
        where: { employerId: profile.id },
        data: { isActive: false },
    });

    return NextResponse.json({ success: true });
}
