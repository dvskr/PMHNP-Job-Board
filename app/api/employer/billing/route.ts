import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/employer/billing
 * Fetch payment history (employer jobs with payment info).
 */
export async function GET() {
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

    const employerJobs = await prisma.employerJob.findMany({
        where: {
            OR: [
                { userId: user.id },
                { contactEmail: user.email! },
            ],
        },
        include: {
            job: {
                select: {
                    title: true,
                    isFeatured: true,
                    createdAt: true,
                    expiresAt: true,
                    isPublished: true,
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    const payments = employerJobs.map((ej) => ({
        id: ej.id,
        jobTitle: ej.job.title,
        tier: ej.job.isFeatured ? 'Growth' : 'Starter',
        status: ej.paymentStatus,
        date: ej.createdAt.toISOString(),
        expiresAt: ej.job.expiresAt?.toISOString() || null,
        isActive: ej.job.isPublished && (!ej.job.expiresAt || new Date(ej.job.expiresAt) > new Date()),
    }));

    return NextResponse.json({ payments });
}
