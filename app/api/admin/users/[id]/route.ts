import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { createClient } from '@/lib/supabase/server';
import {
    collectAdminFields,
    isRecordNotFound,
    type AdminFieldSpec,
} from '../../_lib/field-validation';

const VALID_ROLES = ['job_seeker', 'employer', 'admin'] as const;

const USER_FIELD_SPECS: Record<string, AdminFieldSpec> = {
    role: { kind: 'requiredText', oneOf: VALID_ROLES },
    // Real booleans only. `{"profileVisible":"yes"}` used to reach Prisma and
    // surface as a 500 that told the caller nothing about what was wrong.
    openToOffers: { kind: 'boolean' },
    profileVisible: { kind: 'boolean' },
};

/**
 * The signed-in admin's own UserProfile id, or null if it cannot be resolved.
 *
 * requireApiAdmin proves the caller IS an admin but does not hand back who
 * they are, and the self-target guard below needs the identity, not just the
 * verdict. A null here means the guard cannot run, which the caller treats as
 * a refusal rather than as permission.
 */
async function getCallerProfileId(): Promise<string | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id },
        select: { id: true },
    });
    return profile?.id ?? null;
}

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
        const collected = collectAdminFields(body, USER_FIELD_SPECS);
        if (!collected.ok) {
            return NextResponse.json({ success: false, error: collected.error }, { status: 400 });
        }
        const data = collected.data;

        if (Object.keys(data).length === 0) {
            return NextResponse.json({ success: false, error: 'No valid fields provided' }, { status: 400 });
        }

        // Lockout guard. requireAdmin re-reads the role on every request, so an
        // admin who demotes their own row loses /admin on the next click and
        // there is no in-product way back: the only surface that can restore
        // the role is the one they just locked themselves out of. The role
        // dropdown on /admin/users renders for every row including the
        // caller's own, so this is a click away, not a contrived request.
        if ('role' in data) {
            const callerProfileId = await getCallerProfileId();
            if (!callerProfileId) {
                return NextResponse.json(
                    { success: false, error: 'Could not resolve the signed-in admin; role change refused.' },
                    { status: 500 },
                );
            }
            if (callerProfileId === id) {
                return NextResponse.json(
                    {
                        success: false,
                        error: 'You cannot change your own role. Ask another admin, or change it directly in the database.',
                    },
                    { status: 400 },
                );
            }
        }

        const user = await prisma.userProfile.update({
            where: { id },
            data,
            select: { id: true, email: true, role: true, openToOffers: true, profileVisible: true, updatedAt: true },
        });

        return NextResponse.json({ success: true, user });
    } catch (error) {
        if (isRecordNotFound(error)) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }
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
            // Same lockout as a self-demotion, one step worse: requireApiAdmin
            // resolves the caller by supabaseId, so deleting your own profile
            // row makes every admin request 403 with nothing left to edit.
            // Deactivation (the default branch) only touches visibility flags,
            // so it is not a lockout and is left alone.
            const callerProfileId = await getCallerProfileId();
            if (!callerProfileId) {
                return NextResponse.json(
                    { success: false, error: 'Could not resolve the signed-in admin; delete refused.' },
                    { status: 500 },
                );
            }
            if (callerProfileId === id) {
                return NextResponse.json(
                    { success: false, error: 'You cannot delete your own admin account.' },
                    { status: 400 },
                );
            }
            await prisma.userProfile.delete({ where: { id } });
            return NextResponse.json({ success: true, action: 'hard_deleted' });
        }

        await prisma.userProfile.update({
            where: { id },
            data: { profileVisible: false, openToOffers: false },
        });

        return NextResponse.json({ success: true, action: 'deactivated' });
    } catch (error) {
        if (isRecordNotFound(error)) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }
        console.error('[Admin Users] DELETE error:', error);
        return NextResponse.json({ success: false, error: 'Failed to delete user' }, { status: 500 });
    }
}
