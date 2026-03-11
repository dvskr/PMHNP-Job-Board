import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const specialty = url.searchParams.get('specialty');
        const state = url.searchParams.get('state');
        const workMode = url.searchParams.get('workMode');
        const minExp = url.searchParams.get('minExp');
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = 20;
        const skip = (page - 1) * limit;

        // Determine employer tier (mock for now — will integrate Stripe later)
        const tier = url.searchParams.get('tier') || 'starter';

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

        // Featured tier: more details
        const featuredSelect = {
            ...baseSelect,
            licenseStates: true,
            certifications: true,
            desiredSalaryMin: true,
            desiredSalaryMax: true,
            availableDate: true,
        };

        // Premium tier: full access
        const premiumSelect = {
            ...featuredSelect,
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
                select = featuredSelect;
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

        // For standard/featured tiers, mask the last name
        const masked = candidates.map((c) => {
            if (tier === 'pro') return c;
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
