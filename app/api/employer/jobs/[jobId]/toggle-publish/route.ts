import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * PATCH /api/employer/jobs/[jobId]/toggle-publish
 * Toggle a job's isPublished status (pause/unpublish or republish).
 * Employer must own the job (via userId or contactEmail).
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ jobId: string }> }
) {
    const rateLimitResponse = await rateLimit(req, 'employer:toggle-publish', RATE_LIMITS.employer);
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const { jobId } = await params;
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

        // Find the employer job and verify ownership
        const employerJob = await prisma.employerJob.findFirst({
            where: {
                jobId,
                OR: [
                    { userId: user.id },
                    { contactEmail: user.email! },
                ],
            },
            include: {
                job: { select: { id: true, title: true, isPublished: true, expiresAt: true } },
            },
        });

        // Allow admin bypass
        const isAdmin = profile.role === 'admin';
        if (!employerJob && !isAdmin) {
            return NextResponse.json({ error: 'Job not found or access denied' }, { status: 404 });
        }

        // For admin, fetch job directly
        const job = employerJob
            ? employerJob.job
            : await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, title: true, isPublished: true, expiresAt: true } });

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        // Check if expired — can't unpublish an expired job (it's already effectively off)
        if (job.expiresAt && new Date(job.expiresAt) < new Date() && !job.isPublished) {
            return NextResponse.json({ error: 'Cannot modify an expired job' }, { status: 400 });
        }

        // Toggle
        const newPublishedState = !job.isPublished;
        await prisma.job.update({
            where: { id: job.id },
            data: { isPublished: newPublishedState },
        });

        logger.info('Job publish status toggled', {
            jobId: job.id,
            title: job.title,
            isPublished: newPublishedState,
            userId: user.id,
        });

        return NextResponse.json({
            success: true,
            isPublished: newPublishedState,
            message: newPublishedState ? 'Job is now live' : 'Job has been paused',
        });
    } catch (error) {
        logger.error('Error toggling job publish status', error);
        return NextResponse.json({ error: 'Failed to update job status' }, { status: 500 });
    }
}
