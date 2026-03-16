import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/employer/settings/notifications
 * Get notification preferences for the employer's jobs.
 *
 * PATCH /api/employer/settings/notifications
 * Update notification preferences.
 * Body: { jobId?: string, notifyOnApplication: boolean, notifyDigest: 'instant' | 'daily' | 'off' }
 */

export async function GET(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const employerJobs = await prisma.employerJob.findMany({
        where: {
            OR: [
                { userId: user.id },
                { contactEmail: user.email! },
            ],
        },
        select: {
            id: true,
            jobId: true,
            notifyOnApplication: true,
            notifyDigest: true,
            job: { select: { title: true } },
        },
    });

    return NextResponse.json({
        preferences: employerJobs.map(ej => ({
            employerJobId: ej.id,
            jobId: ej.jobId,
            jobTitle: ej.job.title,
            notifyOnApplication: ej.notifyOnApplication,
            notifyDigest: ej.notifyDigest,
        })),
    });
}

export async function PATCH(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { employerJobId, notifyOnApplication, notifyDigest } = body;

    if (!employerJobId || typeof employerJobId !== 'string') {
        return NextResponse.json({ error: 'employerJobId is required' }, { status: 400 });
    }

    // Verify ownership
    const employerJob = await prisma.employerJob.findUnique({
        where: { id: employerJobId },
        select: { userId: true, contactEmail: true },
    });

    if (!employerJob) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const isOwner = employerJob.userId === user.id || employerJob.contactEmail === user.email;
    if (!isOwner) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Validate notifyDigest
    const validDigests = ['instant', 'daily', 'off'];
    if (notifyDigest && !validDigests.includes(notifyDigest)) {
        return NextResponse.json(
            { error: `Invalid digest. Must be one of: ${validDigests.join(', ')}` },
            { status: 400 }
        );
    }

    // Update
    const updateData: Record<string, unknown> = {};
    if (typeof notifyOnApplication === 'boolean') {
        updateData.notifyOnApplication = notifyOnApplication;
    }
    if (notifyDigest) {
        updateData.notifyDigest = notifyDigest;
    }

    const updated = await prisma.employerJob.update({
        where: { id: employerJobId },
        data: updateData,
    });

    return NextResponse.json({
        success: true,
        notifyOnApplication: updated.notifyOnApplication,
        notifyDigest: updated.notifyDigest,
    });
}
