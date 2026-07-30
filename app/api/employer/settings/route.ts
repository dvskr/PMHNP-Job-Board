import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * GET /api/employer/settings
 * Fetch employer company info from their EmployerJob records.
 */
export async function GET(req: NextRequest) {
    const rateLimitResponse = await rateLimit(req, 'employer:settings', RATE_LIMITS.employer);
    if (rateLimitResponse) return rateLimitResponse;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id },
        select: { id: true, role: true, firstName: true, lastName: true, email: true, phone: true, company: true },
    });

    if (!profile || !['employer', 'admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get latest company info from EmployerJob records
    const latestJob = await prisma.employerJob.findFirst({
        where: {
            OR: [
                { userId: user.id },
                { userId: null, contactEmail: user.email! },
            ],
        },
        orderBy: { createdAt: 'desc' },
        select: {
            employerName: true,
            companyLogoUrl: true,
            companyDescription: true,
            companyWebsite: true,
            contactEmail: true,
        },
    });

    return NextResponse.json({
        profile: {
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: profile.email,
            phone: profile.phone,
            company: profile.company,
        },
        companyInfo: latestJob ? {
            name: latestJob.employerName,
            logoUrl: latestJob.companyLogoUrl,
            description: latestJob.companyDescription,
            website: latestJob.companyWebsite,
            contactEmail: latestJob.contactEmail,
        } : null,
    });
}

/**
 * PATCH /api/employer/settings
 * Update employer profile and company info.
 */
export async function PATCH(req: NextRequest) {
    const rateLimitResponse = await rateLimit(req, 'employer:settings', RATE_LIMITS.employer);
    if (rateLimitResponse) return rateLimitResponse;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id },
        select: { id: true, role: true, company: true },
    });

    if (!profile || !['employer', 'admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { firstName, lastName, phone, company, companyDescription, companyWebsite, companyLogoUrl } = body;

    // COMPANY NAME IS NEVER EDITABLE FROM SETTINGS. It is captured once at
    // employer signup and anchors organization identity: it is authoritative
    // for every job this account posts, and it contributes the org key to the
    // free-post quota (lib/employer-quota.ts). If it were editable here, an
    // employer could rename the organization between posts and look like a
    // brand new one, which is exactly the evasion the org key closes. There
    // is deliberately NO set-while-empty carve-out either, so nobody can park
    // a blank name and choose one right before posting. Changes go through
    // support only. Enforced server-side because a read-only input is not a
    // lock.
    const requestedName = typeof company === 'string' ? company.trim() : null;
    if (requestedName && requestedName !== (profile.company?.trim() || '')) {
        return NextResponse.json(
            {
                error: 'Company name is set at signup and cannot be changed here. Contact support and we will update it for you.',
                code: 'COMPANY_NAME_LOCKED',
                currentName: profile.company,
            },
            { status: 409 },
        );
    }

    // Update UserProfile. `company` is intentionally absent.
    await prisma.userProfile.update({
        where: { id: profile.id },
        data: {
            ...(firstName !== undefined && { firstName }),
            ...(lastName !== undefined && { lastName }),
            ...(phone !== undefined && { phone }),
        },
    });

    // Update company info on all EmployerJob records
    if (companyDescription !== undefined || companyWebsite !== undefined || companyLogoUrl !== undefined) {
        const companyUpdate: Record<string, string | null> = {};
        if (companyDescription !== undefined) companyUpdate.companyDescription = companyDescription;
        if (companyWebsite !== undefined) companyUpdate.companyWebsite = companyWebsite;
        if (companyLogoUrl !== undefined) companyUpdate.companyLogoUrl = companyLogoUrl;
        // employerName is never written from settings: the name is fixed at
        // signup, so published listings always keep the identity they went
        // out under.

        await prisma.employerJob.updateMany({
            where: {
                OR: [
                    { userId: user.id },
                    { userId: null, contactEmail: user.email! },
                ],
            },
            data: companyUpdate,
        });
    }

    return NextResponse.json({ success: true });
}
