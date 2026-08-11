import { NextRequest, NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getOrCreateUnsubToken, sendEmployerMessageNotification } from '@/lib/email-service';
import {
    buildCandidateDigestMessage,
    buildEmployerSignalMessage,
    getOrCreateSystemProfile,
    sendSystemMessage,
    SYSTEM_PROFILE_NAME,
    type DigestJob,
} from '@/lib/system-messages';

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com').replace(/\/$/, '');

/**
 * Admin-only test endpoint for the system-message feature.
 *
 * POST /api/admin/system-message-test?side=employer|candidate&dryRun=1&email=1
 *
 * The recipient is ALWAYS the authenticated admin's own profile: it is
 * resolved from the session, never from the request, so this endpoint cannot
 * message (or email) anyone else. That is what makes it safe to run BEFORE
 * ENABLE_SYSTEM_MESSAGES is turned on: the operator sees the real thread in
 * /messages, checks the copy and the UI tolerance, then enables the flag as
 * a separate explicit step.
 *
 *   side=employer (default)  sample "new applications waiting" nudge
 *   side=candidate           digest built from up to 3 REAL published jobs
 *   dryRun=1                 return the composed subject/body, write nothing
 *   email=1                  also send the employer-style email notification
 *                            to the admin's own address (and nobody else)
 *
 * GET returns a short usage description.
 */
export async function GET(request: NextRequest) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;
    return NextResponse.json({
        usage: 'POST /api/admin/system-message-test?side=employer|candidate&dryRun=1&email=1',
        notes: 'Sends a test system message to YOUR OWN account only. dryRun=1 previews without writing. email=1 also emails your own address.',
    });
}

export async function POST(request: NextRequest) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        // Recipient comes from the session, never from the request body.
        const adminProfile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true, email: true, firstName: true },
        });
        if (!adminProfile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        const { searchParams } = new URL(request.url);
        const dryRun = searchParams.get('dryRun') === '1';
        const side = searchParams.get('side') === 'candidate' ? 'candidate' : 'employer';
        const withEmail = searchParams.get('email') === '1';

        // A dry run must write nothing, and bootstrapping the sender profile is
        // a write (a real UserProfile row that shows up in admin listings and
        // user counts). sendSystemMessage returns before it ever dereferences
        // the id in dryRun mode.
        const systemProfile = await getOrCreateSystemProfile({ create: !dryRun });
        const content = side === 'candidate'
            ? buildCandidateDigestMessage(await fetchSampleJobs())
            : buildEmployerSignalMessage('Psychiatric Mental Health Nurse Practitioner', 3);
        const body = `This is a test system message sent only to your own admin account.\n\n${content.body}`;

        const result = await sendSystemMessage({
            systemProfileId: systemProfile.id,
            recipientProfileId: adminProfile.id,
            subject: `[Test] ${content.subject}`,
            body,
            jobId: null,
            dryRun,
            context: 'admin_test',
        });

        let emailSent = false;
        if (withEmail && !dryRun && result.status === 'sent' && adminProfile.email) {
            // The point of a test send is to see EXACTLY what a real recipient
            // gets, so it passes the same options the cron passes
            // (lib/system-messages.ts maybeNotifyEmployerByEmail). Without the
            // honest intro the operator would review a mail claiming "a
            // candidate has reached out" about a message the platform wrote,
            // and without unsubscribeUrl they would review marketing-class mail
            // with no List-Unsubscribe header. The '[TEST]' prefix is what keeps
            // this send out of the shared 7 day cap query, so testing cannot
            // block the tester's own real mail.
            const unsubToken = await getOrCreateUnsubToken(adminProfile.email);
            const emailResult = await sendEmployerMessageNotification(
                adminProfile.email, // the authenticated admin's own address, only
                adminProfile.firstName,
                SYSTEM_PROFILE_NAME,
                null,
                result.subject,
                body,
                null,
                {
                    emailType: 'system_message_nudge',
                    intro: 'here is an automated update on your live posting.',
                    unsubscribeUrl: `${BASE_URL}/unsubscribe?token=${unsubToken}`,
                    subjectPrefix: '[TEST] ',
                },
            );
            emailSent = emailResult.success;
        }

        logger.info('[SystemMessages] admin test send', {
            side, dryRun, status: result.status, emailSent,
        });
        return NextResponse.json({
            success: true,
            side,
            dryRun,
            status: result.status,
            subject: result.subject,
            body: dryRun ? body : undefined,
            conversationId: result.conversationId ?? null,
            emailSent,
        });
    } catch (error) {
        logger.error('[SystemMessages] admin test send failed', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

/** Up to 3 real published jobs so the candidate-side test carries real links. */
async function fetchSampleJobs(): Promise<DigestJob[]> {
    const jobs = await prisma.job.findMany({
        where: { isPublished: true },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { id: true, title: true, employer: true },
    });
    return jobs;
}
