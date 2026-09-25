import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { sendEmployerMessageNotification } from '@/lib/email-service';
import { canSendInMail, getEmployerTier } from '@/lib/tier-limits';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeText } from '@/lib/sanitize';
import { readJsonBody } from '@/app/api/_lib/json-body';

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

        // Everything below arrives as raw JSON, so each field can be any type or
        // the body can fail to parse at all. Untyped, a numeric `body` skipped
        // the length guard (numbers have no .length) and an object
        // `recipientId` reached Prisma, both surfacing as a 500 on what is
        // plainly a malformed request.
        const parsedBody = await readJsonBody(req);
        if (!parsedBody.ok) return parsedBody.response;
        const { recipientId, subject, body: messageBody, jobId } = parsedBody.body as {
            recipientId?: unknown; subject?: unknown; body?: unknown; jobId?: unknown;
        };

        if (typeof recipientId !== 'string' || typeof subject !== 'string' || typeof messageBody !== 'string'
            || !recipientId.trim() || !subject.trim() || !messageBody.trim()) {
            return NextResponse.json({ error: 'recipientId, subject, and body are required and must be text' }, { status: 400 });
        }

        if (jobId !== undefined && jobId !== null && typeof jobId !== 'string') {
            return NextResponse.json({ error: 'jobId must be a job ID string' }, { status: 400 });
        }
        const requestedJobId: string | null = typeof jobId === 'string' && jobId ? jobId : null;

        if (messageBody.length > 2000) {
            return NextResponse.json({ error: 'Message body must be under 2000 characters' }, { status: 400 });
        }

        // Same caps and stripping the reply path applies
        // (app/api/conversations/[id]/route.ts). Stored raw, an employer's
        // subject had no cap at all and neither field went through the shared
        // sanitizer, so the two halves of one thread were stored under
        // different rules.
        const cleanSubject = sanitizeText(subject.trim(), 200);
        const cleanBody = sanitizeText(messageBody.trim(), 2000);
        if (!cleanSubject || !cleanBody) {
            return NextResponse.json({ error: 'Subject and body must contain readable text' }, { status: 400 });
        }

        // Look up recipient first (needed for conversation check)
        const recipient = await prisma.userProfile.findUnique({
            where: { supabaseId: recipientId },
            select: { id: true, email: true, firstName: true, role: true, profileVisible: true, openToOffers: true },
        });

        if (!recipient) {
            return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
        }

        // A supplied jobId is ownership-checked on EVERY path, not just new
        // outreach. It is written onto the conversation and its title is echoed
        // into the notification email, so an unowned id let an employer put
        // someone else's posting in front of a candidate.
        let ownedJobId: string | null = null;
        if (requestedJobId) {
            const owned = await prisma.job.findFirst({
                where: {
                    id: requestedJobId,
                    employerJobs: {
                        OR: [
                            { userId: user.id },
                            { userId: null, contactEmail: user.email! },
                        ],
                    },
                },
                select: { id: true },
            });
            if (!owned) {
                return NextResponse.json({ error: 'You can only message candidates about your own job postings' }, { status: 403 });
            }
            ownedJobId = owned.id;
        }

        // Check if a conversation already exists — replies are always free
        // (no featured job gate, no InMail credit check). When the caller names
        // a posting, the lookup is scoped to it: a second conversation with the
        // same candidate about a DIFFERENT posting is new outreach and has to
        // be paid for, which an unscoped lookup let through for free.
        const participantPair = [
            { participantA: senderProfile.id, participantB: recipient.id },
            { participantA: recipient.id, participantB: senderProfile.id },
        ];
        const existingConversation = await prisma.conversation.findFirst({
            where: {
                OR: ownedJobId
                    ? participantPair.map(pair => ({ ...pair, jobId: ownedJobId }))
                    : participantPair,
            },
        });

        // Every conversation is attributed to a posting. InMail credits are
        // counted per posting, so a conversation with no jobId was counted
        // against nothing: omitting jobId bought unlimited free outreach.
        let conversationJobId: string | null = existingConversation
            ? existingConversation.jobId ?? ownedJobId
            : ownedJobId;

        if (!existingConversation) {
            // Candidate privacy gate, same one the unlock endpoints enforce
            // (app/api/employer/candidates/[id]/route.ts and
            // profiles/unlock-bulk). New outreach is the moment a candidate's
            // opt-out has to be honored: without this, a seeker who set
            // openToOffers=false or profileVisible=false still received cold
            // InMail and its notification email, and an employer could message
            // another employer or an admin by supabaseId. Replies inside an
            // existing thread are unaffected: a conversation the candidate is
            // already in is not new contact. Admins are exempt, as they are on
            // the unlock paths.
            const senderIsAdmin = senderProfile.role === 'admin';
            const recipientAcceptsOutreach =
                recipient.role === 'job_seeker' && recipient.profileVisible && recipient.openToOffers;
            if (!senderIsAdmin && !recipientAcceptsOutreach) {
                return NextResponse.json(
                    { error: 'This candidate is not currently accepting messages from employers.' },
                    { status: 403 },
                );
            }

            // NEW outreach — requires an ACTIVE featured job posting + InMail
            // credit. "Active" = featured AND published AND not expired,
            // mirroring app/api/employer/candidates/[id]/route.ts and the
            // pricing FAQ ("To unlock new candidates or send new InMails,
            // you'll need an active posting"). Checking isFeatured alone left
            // outreach open after a full refund, chargeback, or expiry.
            if (ownedJobId) {
                const job = await prisma.job.findFirst({
                    where: {
                        id: ownedJobId,
                        isFeatured: true,
                        isPublished: true,
                        expiresAt: { gt: new Date() },
                    },
                    select: { id: true },
                });
                if (!job) {
                    return NextResponse.json({ error: 'Messaging is available for active featured job postings only' }, { status: 403 });
                }
            } else {
                const featuredJob = await prisma.employerJob.findFirst({
                    where: {
                        OR: [
                            { userId: user.id },
                            { userId: null, contactEmail: user.email! },
                        ],
                        job: {
                            isFeatured: true,
                            isPublished: true,
                            expiresAt: { gt: new Date() },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                    select: { job: { select: { id: true } } },
                });
                if (!featuredJob?.job) {
                    return NextResponse.json({ error: 'Messaging is available for active featured job postings only' }, { status: 403 });
                }
                // Charge the posting this outreach implicitly rides on, rather
                // than leaving the conversation unattributed and uncounted.
                conversationJobId = featuredJob.job.id;
            }

            // Refuse rather than fall through uncharged: an outreach we cannot
            // attribute to a posting is an outreach no credit pool can limit.
            if (!conversationJobId) {
                return NextResponse.json({ error: 'Messaging is available for active featured job postings only' }, { status: 403 });
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

        // Look up the title of the posting this message is attributed to
        let jobTitle: string | null = null;
        if (conversationJobId) {
            const job = await prisma.job.findUnique({
                where: { id: conversationJobId },
                select: { title: true },
            });
            jobTitle = job?.title || null;
        }

        // Find or create a Conversation for this sender-recipient pair
        // Try both orderings since participantA/B are interchangeable
        let conversation = existingConversation;

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    participantA: senderProfile.id,
                    participantB: recipient.id,
                    jobId: conversationJobId,
                    subject: cleanSubject,
                },
            });
        }

        // Create the message linked to the conversation
        const message = await prisma.employerMessage.create({
            data: {
                senderId: senderProfile.id,
                recipientId: recipient.id,
                conversationId: conversation.id,
                subject: cleanSubject,
                body: cleanBody,
                ...(conversationJobId && { jobId: conversationJobId }),
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
                cleanSubject,
                cleanBody,
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
