import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            firstName,
            lastName,
            email,
            phone,
            city,
            state,
            zipCode,
            npiNumber,
            yearsExperience,
            specialties,
            certifications,
            bio,
            headline,
            preferredWorkMode,
            preferredJobType,
            desiredSalaryMin,
            desiredSalaryMax,
            availableDate,
            openToOffers,
            profileVisible,
            linkedinUrl,
        } = body;

        if (!email || !firstName || !lastName) {
            return NextResponse.json(
                { error: 'First name, last name, and email are required.' },
                { status: 400 }
            );
        }

        const profileData = {
            firstName,
            lastName,
            phone: phone || null,
            city: city || null,
            state: state || null,
            zipCode: zipCode || null,
            npiNumber: npiNumber || null,
            yearsExperience: yearsExperience ?? null,
            specialties: specialties || null,
            certifications: certifications || null,
            bio: bio || null,
            headline: headline || null,
            preferredWorkMode: preferredWorkMode || null,
            preferredJobType: preferredJobType || null,
            desiredSalaryMin: desiredSalaryMin ?? null,
            desiredSalaryMax: desiredSalaryMax ?? null,
            availableDate: availableDate ? new Date(availableDate) : null,
            openToOffers: openToOffers ?? true,
            profileVisible: profileVisible ?? true,
            linkedinUrl: linkedinUrl || null,
        };

        // Check if profile already exists
        const existing = await prisma.userProfile.findUnique({
            where: { email },
        });

        if (existing) {
            const updated = await prisma.userProfile.update({
                where: { email },
                data: profileData,
            });
            return NextResponse.json({ success: true, id: updated.id, updated: true });
        } else {
            const profile = await prisma.userProfile.create({
                data: {
                    supabaseId: `manual_${Date.now()}`,
                    email,
                    role: 'job_seeker',
                    ...profileData,
                },
            });
            return NextResponse.json({ success: true, id: profile.id, created: true });
        }
    } catch (error) {
        console.error('Error creating/updating candidate profile:', error);
        return NextResponse.json(
            { error: 'Failed to save profile. Please try again.' },
            { status: 500 }
        );
    }
}
