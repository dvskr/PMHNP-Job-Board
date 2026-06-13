import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * PATCH /api/employer/jobs/[jobId]/archive
 * Toggle a job's archive state. Archived jobs:
 *   - Are hidden from public listings (archived_at IS NOT NULL filter)
 *   - Stay visible in the employer dashboard under the "Archived" filter
 *   - Have isPublished forced to false (you can't have a live archived listing)
 *   - Still count against the free-post quota (archive is not delete; an
 *     employer can't game the quota by archiving a free post)
 *
 * Unarchiving simply clears archived_at — but does NOT auto-republish. The
 * employer must republish manually so they can decide whether the post is
 * still relevant before going live again.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ jobId: string }> }
) {
    const rateLimitResponse = await rateLimit(req, 'employer:archive', RATE_LIMITS.employer);
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

        const employerJob = await prisma.employerJob.findFirst({
            where: {
                jobId,
                OR: [
                    { userId: user.id },
                    { userId: null, contactEmail: user.email! },
                ],
            },
            include: {
                job: { select: { id: true, title: true, archivedAt: true, isPublished: true } },
            },
        });

        const isAdmin = profile.role === 'admin';
        if (!employerJob && !isAdmin) {
            return NextResponse.json({ error: 'Job not found or access denied' }, { status: 404 });
        }

        const job = employerJob
            ? employerJob.job
            : await prisma.job.findUnique({
                where: { id: jobId },
                select: { id: true, title: true, archivedAt: true, isPublished: true },
            });

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        const isCurrentlyArchived = job.archivedAt !== null;
        const newArchivedAt = isCurrentlyArchived ? null : new Date();

        await prisma.job.update({
            where: { id: job.id },
            data: {
                archivedAt: newArchivedAt,
                // Archiving hides the listing — force-unpublish in the same write.
                // Unarchiving leaves isPublished alone; employer republishes manually.
                ...(newArchivedAt !== null && { isPublished: false }),
            },
        });

        logger.info('Job archive state toggled', {
            jobId: job.id,
            title: job.title,
            archivedAt: newArchivedAt,
            userId: user.id,
        });

        return NextResponse.json({
            success: true,
            archivedAt: newArchivedAt?.toISOString() ?? null,
            message: newArchivedAt
                ? 'Job archived. It will no longer appear on the public job board.'
                : 'Job restored from archive. Republish it to make it visible again.',
        });
    } catch (error) {
        logger.error('Error toggling job archive state', error);
        return NextResponse.json({ error: 'Failed to update archive state' }, { status: 500 });
    }
}
