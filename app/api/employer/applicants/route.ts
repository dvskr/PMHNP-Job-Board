import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getResumeUrl } from '@/lib/supabase-storage';

/**
 * GET /api/employer/applicants
 * List all applicants for the employer's jobs, with optional filters.
 */
export async function GET(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id },
        select: { role: true },
    });

    if (!profile || !['employer', 'admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status');
    const jobIdFilter = searchParams.get('jobId');

    // Get all job IDs owned by this employer
    const employerJobs = await prisma.employerJob.findMany({
        where: {
            OR: [
                { userId: user.id },
                { contactEmail: user.email! },
            ],
        },
        select: { jobId: true, job: { select: { title: true, id: true } } },
    });

    const jobIds = employerJobs.map(ej => ej.jobId);

    if (jobIds.length === 0) {
        return NextResponse.json({ applicants: [], jobs: [] });
    }

    // Build filter conditions
    const where: Record<string, unknown> = {
        jobId: jobIdFilter ? { in: [jobIdFilter] } : { in: jobIds },
    };
    if (statusFilter && statusFilter !== 'all') {
        where.status = statusFilter;
    }

    const applicants = await prisma.jobApplication.findMany({
        where,
        include: {
            user: {
                select: {
                    supabaseId: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    avatarUrl: true,
                    headline: true,
                    yearsExperience: true,
                    certifications: true,
                    licenseStates: true,
                },
            },
            job: {
                select: {
                    id: true,
                    title: true,
                    isFeatured: true,
                },
            },
        },
        orderBy: { appliedAt: 'desc' },
    });

    // Format response with signed resume URLs
    const formatted = await Promise.all(applicants.map(async (app) => {
        // Generate a signed download URL for the resume (1-hour expiry)
        let signedResumeUrl: string | null = null;
        if (app.resumeUrl) {
            try {
                signedResumeUrl = await getResumeUrl(app.resumeUrl);
            } catch {
                logger.warn('Failed to generate signed resume URL', { resumeUrl: app.resumeUrl });
                signedResumeUrl = null;
            }
        }

        return {
            id: app.id,
            status: app.status,
            notes: app.notes,
            coverLetter: app.coverLetter || null,
            coverLetterUrl: app.coverLetterUrl || null,
            resumeUrl: signedResumeUrl,
            appliedAt: app.appliedAt.toISOString(),
            statusUpdatedAt: app.statusUpdatedAt?.toISOString() || null,
            candidate: {
                id: app.user.supabaseId,
                name: [app.user.firstName, app.user.lastName].filter(Boolean).join(' ') || 'PMHNP Candidate',
                initials: `${(app.user.firstName || 'P').charAt(0)}${(app.user.lastName || 'C').charAt(0)}`.toUpperCase(),
                avatarUrl: app.user.avatarUrl,
                headline: app.user.headline,
                yearsExperience: app.user.yearsExperience,
                certifications: app.user.certifications,
                licenseStates: app.user.licenseStates,
            },
            job: {
                id: app.job.id,
                title: app.job.title,
                isFeatured: app.job.isFeatured,
            },
        };
    }));

    const jobs = employerJobs.map(ej => ({
        id: ej.job.id,
        title: ej.job.title,
    }));

    return NextResponse.json({ applicants: formatted, jobs });
}

/**
 * PATCH /api/employer/applicants
 * Update an applicant's status and/or notes.
 */
export async function PATCH(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { applicationId, status, notes } = body;

    if (!applicationId) {
        return NextResponse.json({ error: 'applicationId is required' }, { status: 400 });
    }

    // Verify the application belongs to one of this employer's jobs
    const application = await prisma.jobApplication.findUnique({
        where: { id: applicationId },
        include: {
            job: {
                include: {
                    employerJobs: {
                        select: { userId: true, contactEmail: true },
                    },
                },
            },
        },
    });

    if (!application) {
        return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const employerJob = application.job.employerJobs;
    const isOwner = employerJob &&
        (employerJob.userId === user.id || employerJob.contactEmail === user.email);

    if (!isOwner) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Validate status
    const validStatuses = ['applied', 'screening', 'interview', 'offered', 'hired', 'rejected', 'withdrawn'];
    if (status && !validStatuses.includes(status)) {
        return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    // Update
    const updateData: Record<string, unknown> = {};
    if (status !== undefined) {
        updateData.status = status;
        updateData.statusUpdatedAt = new Date();
    }
    if (notes !== undefined) {
        updateData.notes = notes;
    }

    const updated = await prisma.jobApplication.update({
        where: { id: applicationId },
        data: updateData,
    });

    // Send status change notification email to the candidate (fire-and-forget)
    if (status && status !== application.status) {
        try {
            const candidateProfile = await prisma.userProfile.findUnique({
                where: { supabaseId: application.userId },
                select: { email: true, firstName: true, lastName: true },
            });

            if (candidateProfile?.email) {
                const { sendStatusUpdateEmail } = await import('@/lib/email-service');
                sendStatusUpdateEmail({
                    candidateEmail: candidateProfile.email,
                    candidateName: [candidateProfile.firstName, candidateProfile.lastName].filter(Boolean).join(' ') || 'there',
                    jobTitle: application.job.title,
                    employerName: application.job.employer,
                    newStatus: status,
                }).catch(err => logger.error('Failed to send status update email', err));
            }
        } catch (err) {
            logger.error('Failed to send status update email', err);
        }
    }

    return NextResponse.json({
        success: true,
        application: {
            id: updated.id,
            status: updated.status,
            notes: updated.notes,
            statusUpdatedAt: updated.statusUpdatedAt?.toISOString() || null,
        },
    });
}
