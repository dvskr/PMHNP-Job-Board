import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/applications/check?jobId=xxx
 * Returns whether the current user has already applied to a specific job.
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ applied: false });
        }

        const jobId = request.nextUrl.searchParams.get('jobId');
        if (!jobId) {
            return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
        }

        const application = await prisma.jobApplication.findUnique({
            where: {
                userId_jobId: { userId: user.id, jobId },
            },
            select: {
                id: true,
                appliedAt: true,
                status: true,
                withdrawnAt: true,
            },
        });

        if (!application || application.withdrawnAt) {
            return NextResponse.json({ applied: false });
        }

        return NextResponse.json({
            applied: true,
            appliedAt: application.appliedAt,
            status: application.status,
        });
    } catch {
        return NextResponse.json({ applied: false });
    }
}
