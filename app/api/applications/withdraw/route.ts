import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * DELETE /api/applications/withdraw
 * Withdraw an application and scrub applicant data (GDPR right to erasure).
 * Body: { applicationId: string }
 */
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { applicationId } = body;

        if (!applicationId || typeof applicationId !== 'string') {
            return NextResponse.json({ error: 'applicationId is required' }, { status: 400 });
        }

        // Verify the application belongs to this user
        const application = await prisma.jobApplication.findUnique({
            where: { id: applicationId },
            select: { userId: true, jobId: true },
        });

        if (!application) {
            return NextResponse.json({ error: 'Application not found' }, { status: 404 });
        }

        if (application.userId !== user.id) {
            return NextResponse.json({ error: 'You can only withdraw your own applications' }, { status: 403 });
        }

        // Scrub personal data but keep the record for analytics (GDPR-compliant)
        await prisma.jobApplication.update({
            where: { id: applicationId },
            data: {
                coverLetter: null,
                resumeUrl: null,
                status: 'withdrawn',
                withdrawnAt: new Date(),
                notes: null,
            },
        });

        logger.info('Application withdrawn (GDPR)', {
            applicationId,
            userId: user.id,
            jobId: application.jobId,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Error withdrawing application:', error);
        return NextResponse.json(
            { error: 'Failed to withdraw application' },
            { status: 500 }
        );
    }
}
