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

        // Optional unpublish-reason payload — only consumed when transitioning
        // published -> unpublished. Republishing ignores any reason in the body.
        // Validated against a fixed allowlist; "other" requires the free-text note.
        const ALLOWED_REASONS = ['filled', 'too_many_applicants', 'enough_applicants', 'reposting_later', 'low_quality', 'other'] as const;
        type UnpublishReason = typeof ALLOWED_REASONS[number];
        let providedReason: UnpublishReason | null = null;
        let providedNote: string | null = null;
        try {
            const body = await req.json().catch(() => null) as { reason?: string; note?: string } | null;
            if (body?.reason && (ALLOWED_REASONS as readonly string[]).includes(body.reason)) {
                providedReason = body.reason as UnpublishReason;
                if (typeof body.note === 'string' && body.note.trim().length > 0) {
                    providedNote = body.note.trim().slice(0, 1000);
                }
            }
        } catch { /* body optional — toggling without a reason is allowed */ }

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

        // Toggle. When transitioning published -> unpublished, persist the
        // reason if the modal provided one and stamp `unpublished_at` so we
        // know when this state change happened (audit + outreach trigger).
        const newPublishedState = !job.isPublished;
        const updateData: {
          isPublished: boolean;
          isManuallyUnpublished?: boolean;
          unpublishReason?: string | null;
          unpublishReasonNote?: string | null;
          unpublishedAt?: Date | null;
        } = { isPublished: newPublishedState };

        if (!newPublishedState) {
            // Pause / unpublish
            updateData.isManuallyUnpublished = true;
            updateData.unpublishedAt = new Date();
            if (providedReason) {
                updateData.unpublishReason = providedReason;
                // Only persist the note when the reason is "other" — otherwise
                // it's redundant / reduces analytical signal.
                updateData.unpublishReasonNote = providedReason === 'other' ? providedNote : null;
            }
        } else {
            // Republish — clear the manual flag so the cron lifecycle treats
            // this row as freshly active again. Reason stays as historical record.
            updateData.isManuallyUnpublished = false;
        }

        await prisma.job.update({
            where: { id: job.id },
            data: updateData,
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
