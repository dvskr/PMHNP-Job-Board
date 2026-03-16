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

        const job = await prisma.job.update({
            where: { id },
            data,
            select: {
                id: true, title: true, employer: true, isPublished: true,
                isFeatured: true, updatedAt: true,
            },
        });

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
