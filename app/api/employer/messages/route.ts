import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { sendEmployerMessageNotification } from '@/lib/email-service';
import { canSendInMail, getEmployerTier } from '@/lib/tier-limits';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * GET /api/employer/messages — List sent messages for the employer
 * POST /api/employer/messages — Send a new message to a candidate
 */
export async function GET(req: NextRequest) {
    try {
        const rateLimitResponse = await rateLimit(req, 'employer:messages', RATE_LIMITS.employer);
        if (rateLimitResponse) return rateLimitResponse;

        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Look up profile by Supabase ID
        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true, role: true },
        });

        if (!profile || !['employer', 'admin'].includes(profile.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const messages = await prisma.employerMessage.findMany({
            where: { senderId: profile.id },
            orderBy: { sentAt: 'desc' },
            take: 50,
            include: {
                recipient: {
                    select: { firstName: true, lastName: true, email: true },
                },
                job: {
                    select: { id: true, title: true },
                },
            },
        });

        const formatted = messages.map(m => ({
            id: m.id,
            subject: m.subject,
            body: m.body,
            sentAt: m.sentAt.toISOString(),
            readAt: m.readAt?.toISOString() || null,
            recipientName: [m.recipient.firstName, m.recipient.lastName].filter(Boolean).join(' ') || m.recipient.email || 'Unknown',
            jobTitle: m.job?.title || null,
        }));

        return NextResponse.json({ messages: formatted });
    } catch (error) {
        console.error('Error fetching employer messages:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const rateLimitResponse = await rateLimit(req, 'employer:messages', RATE_LIMITS.employer);
        if (rateLimitResponse) return rateLimitResponse;

        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Look up sender profile and verify employer role
        const senderProfile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true, firstName: true, lastName: true, company: true, role: true },
        });

        if (!senderProfile || !['employer', 'admin'].includes(senderProfile.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const { recipientId, subject, body: messageBody, jobId } = body;

        if (!recipientId || !subject || !messageBody) {
            return NextResponse.json({ error: 'recipientId, subject, and body are required' }, { status: 400 });
        }

        if (messageBody.length > 2000) {
            return NextResponse.json({ error: 'Message body must be under 2000 characters' }, { status: 400 });
        }

        // Look up recipient first (needed for conversation check)
        const recipient = await prisma.userProfile.findUnique({
            where: { supabaseId: recipientId },
            select: { id: true, email: true, firstName: true },
        });

        if (!recipient) {
            return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
        }

        // Check if a conversation already exists — replies are always free
        // (no featured job gate, no InMail credit check)
        const existingConversation = await prisma.conversation.findFirst({
            where: {
                OR: [
                    { participantA: senderProfile.id, participantB: recipient.id },
                    { participantA: recipient.id, participantB: senderProfile.id },
                ],
            },
        });

        if (!existingConversation) {
            // NEW outreach — requires a featured job posting + InMail credit
            // Gate: messaging requires a featured job posting
            if (jobId) {
                const job = await prisma.job.findFirst({
                    where: {
                        id: jobId,
                        isFeatured: true,
                        employerJobs: {
                            OR: [
                                { userId: user.id },
                                { userId: null, contactEmail: user.email! },
                            ],
                        },
                    },
                    select: { id: true },
                });
                if (!job) {
                    return NextResponse.json({ error: 'Messaging is available for featured job postings only' }, { status: 403 });
                }
            } else {
                const featuredJob = await prisma.employerJob.findFirst({
                    where: {
                        OR: [
                            { userId: user.id },
                            { userId: null, contactEmail: user.email! },
                        ],
                        job: { isFeatured: true },
                    },
                    select: { id: true },
                });
                if (!featuredJob) {
                    return NextResponse.json({ error: 'Messaging is available for featured job postings only' }, { status: 403 });
                }
            }

            // Check InMail credits for new outreach
            const tier = await getEmployerTier(user.id);
            const inmailCheck = await canSendInMail(senderProfile.id, user.id, tier);
            if (!inmailCheck.allowed) {
                return NextResponse.json({
                    error: 'InMail limit reached for this posting',
                    used: inmailCheck.used,
                    limit: inmailCheck.limit,
                    tier,
                    upgradeRequired: true,
                }, { status: 403 });
            }
        }

        // Look up job title if jobId provided
        let jobTitle: string | null = null;
        if (jobId) {
            const job = await prisma.job.findUnique({
                where: { id: jobId },
                select: { title: true },
            });
            jobTitle = job?.title || null;
        }

        // Find or create a Conversation for this sender-recipient pair
        // Try both orderings since participantA/B are interchangeable
        let conversation = await prisma.conversation.findFirst({
            where: {
                OR: [
                    { participantA: senderProfile.id, participantB: recipient.id, jobId: jobId || null },
                    { participantA: recipient.id, participantB: senderProfile.id, jobId: jobId || null },
                ],
            },
        });

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    participantA: senderProfile.id,
                    participantB: recipient.id,
                    jobId: jobId || null,
                    subject,
                },
            });
        }

        // Create the message linked to the conversation
        const message = await prisma.employerMessage.create({
            data: {
                senderId: senderProfile.id,
                recipientId: recipient.id,
                conversationId: conversation.id,
                subject,
                body: messageBody,
                ...(jobId && { jobId }),
            },
        });

        // Update conversation's lastMessageAt
        await prisma.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: new Date() },
        });

        // Send email notification (non-blocking)
        const senderName = [senderProfile.firstName, senderProfile.lastName].filter(Boolean).join(' ') || 'An employer';

        if (recipient.email) {
            sendEmployerMessageNotification(
                recipient.email,
                recipient.firstName,
                senderName,
                senderProfile.company,
                subject,
                messageBody,
                jobTitle
            ).catch(err => console.error('Email notification error:', err));
        }

        return NextResponse.json({
            success: true,
            message: {
                id: message.id,
                sentAt: message.sentAt.toISOString(),
            },
            conversationId: conversation.id,
        });
    } catch (error) {
        console.error('Error sending employer message:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
