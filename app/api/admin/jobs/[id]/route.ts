import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';

/**
 * GET /api/admin/jobs/:id
 * Full job detail with engagement stats.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const job = await prisma.job.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        applyClicks: true,
                        jobApplications: true,
                        jobViewEvents: true,
                        jobReports: true,
                    },
                },
            },
        });

        if (!job) {
            return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, job });
    } catch (error) {
        console.error('[Admin Jobs] GET/:id error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch job' }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/jobs/:id
 * Update any job field.
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const body = await request.json();

        // Only allow known fields
        const allowedFields = [
            'title', 'employer', 'location', 'description', 'descriptionSummary',
            'applyLink', 'jobType', 'mode', 'city', 'state', 'stateCode', 'country',
            'isRemote', 'isHybrid', 'salaryRange', 'minSalary', 'maxSalary',
            'salaryPeriod', 'displaySalary', 'normalizedMinSalary', 'normalizedMaxSalary',
            'isPublished', 'isFeatured', 'isVerifiedEmployer',
            'benefits', 'setting', 'population', 'qualityScore', 'expiresAt',
        ];

        const data: Record<string, unknown> = {};
        for (const field of allowedFields) {
            if (field in body) {
                data[field] = body[field];
            }
        }

        if (Object.keys(data).length === 0) {
            return NextResponse.json(
                { success: false, error: 'No valid fields provided' },
                { status: 400 },
            );
        }

        // Phase 1 guard (2026-06-01): swap inverted salary range so
        // downstream BETWEEN queries don't return empty. Mirrors the
        // post-free flow guard; catches admin-edit fat-finger mistakes.
        if ('minSalary' in data && 'maxSalary' in data) {
            const minN = data.minSalary == null ? null : Number(data.minSalary);
            const maxN = data.maxSalary == null ? null : Number(data.maxSalary);
            if (minN != null && maxN != null && Number.isFinite(minN) && Number.isFinite(maxN) && minN > maxN) {
                data.minSalary = maxN;
                data.maxSalary = minN;
            }
        }

        // Validate expiresAt — previously this was a pass-through that accepted
        // any value the admin form sent. That allowed silent setting of arbitrary
        // dates (year 9999, dates in the past, malformed strings) and is the
        // most likely cause of the production SOL Mental Health 74-day anomaly.
        // Now: must be parseable, must be in the future, must be within 12
        // months of NOW (admins shouldn't be pushing posts more than a year out).
        if ('expiresAt' in data) {
            const raw = data.expiresAt;
            if (raw === null) {
                // explicit clear is allowed (e.g. archive/cleanup workflows)
            } else {
                const parsed = raw instanceof Date ? raw : new Date(String(raw));
                if (Number.isNaN(parsed.getTime())) {
                    return NextResponse.json(
                        { success: false, error: 'expiresAt must be a valid date' },
                        { status: 400 },
                    );
                }
                const now = Date.now();
                const maxFuture = now + 365 * 24 * 60 * 60 * 1000; // 12 months
                if (parsed.getTime() < now) {
                    return NextResponse.json(
                        { success: false, error: 'expiresAt cannot be in the past — use isPublished=false to unpublish instead' },
                        { status: 400 },
                    );
                }
                if (parsed.getTime() > maxFuture) {
                    return NextResponse.json(
                        { success: false, error: 'expiresAt cannot be more than 12 months in the future' },
                        { status: 400 },
                    );
                }
                data.expiresAt = parsed;
            }
        }

        // Capture the prior expiresAt for audit trail when changing it
        const priorJob = 'expiresAt' in data
            ? await prisma.job.findUnique({ where: { id }, select: { expiresAt: true, title: true } })
            : null;

        const job = await prisma.job.update({
            where: { id },
            data,
            select: {
                id: true, title: true, employer: true, isPublished: true,
                isFeatured: true, updatedAt: true, expiresAt: true,
            },
        });

        // Log expiry edits to AuditLog so we can answer "who changed this and when"
        // for the next anomaly investigation.
        if (priorJob && 'expiresAt' in data) {
            const priorIso = priorJob.expiresAt?.toISOString() ?? null;
            const newIso = job.expiresAt?.toISOString() ?? null;
            if (priorIso !== newIso) {
                await prisma.auditLog.create({
                    data: {
                        action: 'admin.job.expiry_change',
                        actorType: 'admin',
                        targetType: 'job',
                        targetId: id,
                        metadata: { from: priorIso, to: newIso, jobTitle: priorJob.title },
                    },
                }).catch((err) => console.error('[Admin Jobs] failed to write audit log', err));
            }
        }

        return NextResponse.json({ success: true, job });
    } catch (error) {
        console.error('[Admin Jobs] PATCH error:', error);
        return NextResponse.json({ success: false, error: 'Failed to update job' }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/jobs/:id
 * Soft-delete by default (sets isPublished=false).
 * Use ?hard=true for permanent deletion.
 *
 * Audit #25: hard-delete is BLOCKED on free posts. Cascade-deleting an
 * EmployerJob row that recorded a freebie use would drop the domain's
 * freebie count, letting the (probably-just-spammy) employer post 2 fresh
 * free jobs from a clean slate. Admin can still soft-delete free posts,
 * which removes them from search without nuking the quota signal.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    const { id } = await params;
    const hard = new URL(request.url).searchParams.get('hard') === 'true';

    try {
        if (hard) {
            // Audit #25: refuse hard-delete if the job is a free posting.
            // Cascade through EmployerJob would drop the quotaDomain row that
            // anchors the freebie quota count.
            const employerJob = await prisma.employerJob.findUnique({
                where: { jobId: id },
                select: { paymentStatus: true },
            });
            if (employerJob && employerJob.paymentStatus === 'free') {
                return NextResponse.json(
                    {
                        success: false,
                        error: 'Cannot hard-delete a free posting — cascade would erase the freebie-quota record. Soft-delete (default, no ?hard flag) instead, or contact engineering for a quota-preserving removal.',
                    },
                    { status: 409 },
                );
            }

            await prisma.job.delete({ where: { id } });
            return NextResponse.json({ success: true, action: 'hard_deleted' });
        }

        await prisma.job.update({
            where: { id },
            data: { isPublished: false },
        });

        return NextResponse.json({ success: true, action: 'soft_deleted' });
    } catch (error) {
        console.error('[Admin Jobs] DELETE error:', error);
        return NextResponse.json({ success: false, error: 'Failed to delete job' }, { status: 500 });
    }
}
