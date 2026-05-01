import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { getEmployerTier, getEmployerActivePostings } from '@/lib/tier-limits';

export async function GET(req: NextRequest) {
    try {
        // Auth check — employer or admin only
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

        // Real gates: isAdmin (admin-only fields) and hasActivePosting (unlock-eligible
        // metadata). Tier value is informational only in the single-tier model.
        const isAdmin = profile.role === 'admin';
        const tier = await getEmployerTier(user.id);
        const hasActivePosting = isAdmin
            ? true
            : (await getEmployerActivePostings(user.id)).length > 0;

        const url = new URL(req.url);
        const specialty = url.searchParams.get('specialty');
        const state = url.searchParams.get('state');
        const workMode = url.searchParams.get('workMode');
        const minExp = url.searchParams.get('minExp');
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = 20;
        const skip = (page - 1) * limit;

        // Build where clause
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: any = {
            role: 'job_seeker',
            profileVisible: true,
            openToOffers: true,
        };

        if (state) where.state = state;
        if (minExp) where.yearsExperience = { gte: parseInt(minExp) };
        if (specialty) where.specialties = { contains: specialty, mode: 'insensitive' };
        if (workMode) where.preferredWorkMode = { contains: workMode, mode: 'insensitive' };

        // Base select fields (everyone)
        const baseSelect = {
            id: true,
            firstName: true,
            lastName: true,
            state: true,
            city: true,
            specialties: true,
            yearsExperience: true,
            preferredWorkMode: true,
            preferredJobType: true,
            headline: true,
            bio: true,
            createdAt: true,
        };

        // Active-posting fields — unlock-eligible metadata
        const activeSelect = {
            ...baseSelect,
            licenseStates: true,
            certifications: true,
            desiredSalaryMin: true,
            desiredSalaryMax: true,
            availableDate: true,
        };

        // Admin-only — full PII access (email, phone, NPI, etc.)
        const adminSelect = {
            ...activeSelect,
            email: true,
            phone: true,
            npiNumber: true,
            zipCode: true,
            linkedinUrl: true,
        };

        const select = isAdmin ? adminSelect
            : hasActivePosting ? activeSelect
            : baseSelect;

        const [candidates, total] = await Promise.all([
            prisma.userProfile.findMany({
                where,
                select,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.userProfile.count({ where }),
        ]);

        // Privacy: full last name only for admins; everyone else first-initial
        const masked = candidates.map((c) => {
            if (isAdmin) return c;
            return {
                ...c,
                lastName: c.lastName ? c.lastName[0] + '.' : '',
            };
        });

        return NextResponse.json({
            candidates: masked,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            tier,
        });
    } catch (error) {
        console.error('Error searching candidates:', error);
        return NextResponse.json(
            { error: 'Failed to search candidates' },
            { status: 500 }
        );
    }
}
