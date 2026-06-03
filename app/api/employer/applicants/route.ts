import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { mintResumeReadUrl, extractRequestContext } from '@/lib/resume-storage';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * GET /api/employer/applicants
 * List all applicants for the employer's jobs, with optional filters.
 */
export async function GET(req: NextRequest) {
    const rateLimitResponse = await rateLimit(req, 'employer:applicants', RATE_LIMITS.employer);
    if (rateLimitResponse) return rateLimitResponse;

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

    // P5.A fix (2026-06-01): ownership tightened. Pre-fix: OR(userId,
    // contactEmail) meant anyone who signed up with an existing
    // employer's contactEmail could see/manage their applicants. Now:
    //   - Rows WITH userId require strict userId match (claimed posts).
    //   - Rows WITHOUT userId fall back to contactEmail match (legacy
    //     pre-account posts that never got upgraded).
    // Supabase's signup-email verification is the trust anchor for the
    // contactEmail branch: an attacker can't sign up with someone
    // else's email without controlling the inbox.
    const employerJobs = await prisma.employerJob.findMany({
        where: {
            OR: [
                { userId: user.id },
                { userId: null, contactEmail: user.email! },
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
                    specialties: true,
                    bio: true,
                    skills: true,
                    education: { orderBy: { graduationDate: 'desc' }, take: 3 },
                    workExperience: { orderBy: { startDate: 'desc' }, take: 3 },
                    certificationRecords: { take: 5 },
                    licenses: { take: 5 },
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

    // Format response with signed resume URLs. Each URL is minted via
    // the centralized helper so the access is audit-logged
    // (audience='employer'); admin role isn't checked here because this
    // endpoint is employer-scoped — the upstream auth gate filters out
    // non-employer roles before this point.
    const reqCtx = extractRequestContext(req);
    const formatted = await Promise.all(applicants.map(async (app) => {
        const signedResumeUrl = app.resumeUrl
            ? await mintResumeReadUrl(app.resumeUrl, {
                  actorId: user.id,
                  ownerId: app.user?.supabaseId ?? 'unknown',
                  audience: 'employer',
                  action: 'view',
                  ip: reqCtx.ip,
                  userAgent: reqCtx.userAgent,
                  reason: `applicants list — application ${app.id}`,
              })
            : null;

        return {
            id: app.id,
            status: app.status,
            notes: app.notes,
            coverLetter: app.coverLetter || null,
            coverLetterUrl: app.coverLetterUrl || null,
            resumeUrl: signedResumeUrl,
            appliedAt: app.appliedAt.toISOString(),
            statusUpdatedAt: app.statusUpdatedAt?.toISOString() || null,
            // AI Scoring
            aiMatchScore: app.aiMatchScore ?? null,
            aiMatchReasons: app.aiMatchReasons || [],
            aiMissingItems: app.aiMissingItems || [],
            // Screening Answers
            screeningAnswers: app.screeningAnswers || null,
            candidate: {
                id: app.user.supabaseId,
                name: [app.user.firstName, app.user.lastName].filter(Boolean).join(' ') || 'PMHNP Candidate',
                initials: `${(app.user.firstName || 'P').charAt(0)}${(app.user.lastName || 'C').charAt(0)}`.toUpperCase(),
                avatarUrl: app.user.avatarUrl,
                headline: app.user.headline,
                yearsExperience: app.user.yearsExperience,
                certifications: app.user.certifications,
                licenseStates: app.user.licenseStates,
                specialties: app.user.specialties,
                bio: app.user.bio,
                skills: app.user.skills || [],
                education: app.user.education?.map(e => ({
                    degreeType: e.degreeType,
                    fieldOfStudy: e.fieldOfStudy,
                    schoolName: e.schoolName,
                    graduationDate: e.graduationDate?.toISOString() || null,
                })) || [],
                workExperience: app.user.workExperience?.map(w => ({
                    jobTitle: w.jobTitle,
                    employerName: w.employerName,
                    startDate: w.startDate?.toISOString() || null,
                    endDate: w.endDate?.toISOString() || null,
                    isCurrent: w.isCurrent,
                    practiceSetting: w.practiceSetting,
                })) || [],
                certificationRecords: app.user.certificationRecords?.map(c => ({
                    name: c.certificationName,
                    body: c.certifyingBody,
                    expirationDate: c.expirationDate?.toISOString() || null,
                })) || [],
                licenses: app.user.licenses?.map(l => ({
                    type: l.licenseType,
                    state: l.licenseState,
                    status: l.status,
                })) || [],
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
    const rateLimitResponse = await rateLimit(req, 'employer:applicants', RATE_LIMITS.employer);
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

    // P5.A: tightened ownership. Same logic as the listing query above —
    // contactEmail fallback only applies when the row has no claimed
    // userId. Prevents takeover by signup-with-existing-employer-email.
    const employerJob = application.job.employerJobs;
    const isAdmin = profile.role === 'admin';
    const isOwner = isAdmin || (!!employerJob && (
        (employerJob.userId && employerJob.userId === user.id) ||
        (!employerJob.userId && employerJob.contactEmail === user.email)
    ));

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
