import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/employer/settings
 * Fetch employer company info from their EmployerJob records.
 */
export async function GET() {
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
                { contactEmail: user.email! },
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
    const { firstName, lastName, phone, company, companyDescription, companyWebsite, companyLogoUrl } = body;

    // Update UserProfile
    await prisma.userProfile.update({
        where: { id: profile.id },
        data: {
            ...(firstName !== undefined && { firstName }),
            ...(lastName !== undefined && { lastName }),
            ...(phone !== undefined && { phone }),
            ...(company !== undefined && { company }),
        },
    });

    // Update company info on all EmployerJob records
    if (companyDescription !== undefined || companyWebsite !== undefined || companyLogoUrl !== undefined || company !== undefined) {
        const companyUpdate: Record<string, string | null> = {};
        if (companyDescription !== undefined) companyUpdate.companyDescription = companyDescription;
        if (companyWebsite !== undefined) companyUpdate.companyWebsite = companyWebsite;
        if (companyLogoUrl !== undefined) companyUpdate.companyLogoUrl = companyLogoUrl;
        if (company !== undefined) companyUpdate.employerName = company;

        await prisma.employerJob.updateMany({
            where: {
                OR: [
                    { userId: user.id },
                    { contactEmail: user.email! },
                ],
            },
            data: companyUpdate,
        });
    }

    return NextResponse.json({ success: true });
}
