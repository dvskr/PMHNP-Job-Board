import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';

/**
 * GET /api/admin/users/:id
 * Full user profile with activity stats.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const user = await prisma.userProfile.findUnique({
            where: { id },
            include: {
                jobApplications: {
                    orderBy: { appliedAt: 'desc' },
                    take: 20,
                    include: {
                        job: { select: { id: true, title: true, employer: true, isPublished: true } },
                    },
                },
                autofillUsage: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    select: { id: true, pageUrl: true, atsName: true, fieldsFilled: true, aiGenerations: true, createdAt: true },
                },
                _count: {
                    select: {
                        jobApplications: true,
                        autofillUsage: true,
                        autofillTelemetry: true,
                        employerJobs: true,
                    },
                },
            },
        });

        if (!user) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, user });
    } catch (error) {
        console.error('[Admin Users] GET/:id error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch user' }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/users/:id
 * Update user role or deactivate.
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
        const allowedFields = ['role', 'openToOffers', 'profileVisible'];
        const data: Record<string, unknown> = {};

        for (const field of allowedFields) {
            if (field in body) {
                if (field === 'role') {
                    const validRoles = ['job_seeker', 'employer', 'admin'];
                    if (!validRoles.includes(body.role)) {
                        return NextResponse.json(
                            { success: false, error: `Invalid role. Must be: ${validRoles.join(', ')}` },
                            { status: 400 },
                        );
                    }
                }
                data[field] = body[field];
            }
        }

        if (Object.keys(data).length === 0) {
            return NextResponse.json({ success: false, error: 'No valid fields provided' }, { status: 400 });
        }

        const user = await prisma.userProfile.update({
            where: { id },
            data,
            select: { id: true, email: true, role: true, openToOffers: true, profileVisible: true, updatedAt: true },
        });

        return NextResponse.json({ success: true, user });
    } catch (error) {
        console.error('[Admin Users] PATCH error:', error);
        return NextResponse.json({ success: false, error: 'Failed to update user' }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/users/:id
 * Deactivate user (hides profile, sets openToOffers=false).
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
            await prisma.userProfile.delete({ where: { id } });
            return NextResponse.json({ success: true, action: 'hard_deleted' });
        }

        await prisma.userProfile.update({
            where: { id },
            data: { profileVisible: false, openToOffers: false },
        });

        return NextResponse.json({ success: true, action: 'deactivated' });
    } catch (error) {
        console.error('[Admin Users] DELETE error:', error);
        return NextResponse.json({ success: false, error: 'Failed to delete user' }, { status: 500 });
    }
}
