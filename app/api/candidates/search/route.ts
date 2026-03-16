import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { getEmployerTier } from '@/lib/tier-limits';

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

        // Determine employer tier from server (admin gets premium access)
        const tier = profile.role === 'admin' ? 'premium' : await getEmployerTier(user.id);

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

        // Base select fields (all tiers)
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

        // Growth tier: more details
        const growthSelect = {
            ...baseSelect,
            licenseStates: true,
            certifications: true,
            desiredSalaryMin: true,
            desiredSalaryMax: true,
            availableDate: true,
        };

        // Premium tier: full access
        const premiumSelect = {
            ...growthSelect,
            email: true,
            phone: true,
            npiNumber: true,
            zipCode: true,
            linkedinUrl: true,
        };

        let select;
        switch (tier) {
            case 'premium':
                select = premiumSelect;
                break;
            case 'growth':
                select = growthSelect;
                break;
            default:
                select = baseSelect;
        }

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

        // For starter/growth tiers, mask the last name. Premium gets full names.
        const masked = candidates.map((c) => {
            if (tier === 'premium') return c;
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
