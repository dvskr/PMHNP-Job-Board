import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { sendEmployerMessageNotification, sendCandidateInquiryNotification } from '@/lib/email-service';
import { sanitizeText } from '@/lib/sanitize';
import { verifyCsrf } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { mintDocReadUrl, extractRequestContext } from '@/lib/document-storage';

/**
 * GET /api/conversations/[id]
 * Fetch all messages in a conversation thread. Auto-marks received messages as read.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true },
        });
        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        // Verify user is a participant
        const conversation = await prisma.conversation.findUnique({
            where: { id },
            include: {
                userA: { select: { id: true, supabaseId: true, firstName: true, lastName: true, company: true, role: true, avatarUrl: true, email: true, headline: true, specialties: true, licenseStates: true } },
                userB: { select: { id: true, supabaseId: true, firstName: true, lastName: true, company: true, role: true, avatarUrl: true, email: true, headline: true, specialties: true, licenseStates: true } },
                job: { select: { id: true, title: true, slug: true } },
            },
        });

        if (!conversation) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        if (conversation.participantA !== profile.id && conversation.participantB !== profile.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Determine which side the current user is
        const isParticipantA = conversation.participantA === profile.id;

        // Fetch all messages in this conversation, excluding soft-deleted ones for current user
        const messages = await prisma.employerMessage.findMany({
            where: {
                conversationId: id,
                ...(isParticipantA
                    ? {
                        OR: [
                            { senderId: profile.id, deletedBySender: false },
                            { recipientId: profile.id, deletedByRecipient: false },
                        ],
                    }
                    : {
                        OR: [
                            { senderId: profile.id, deletedBySender: false },
                            { recipientId: profile.id, deletedByRecipient: false },
                        ],
                    }),
            },
            orderBy: { sentAt: 'asc' },
            select: {
                id: true,
                senderId: true,
                body: true,
                sentAt: true,
                readAt: true,
                editedAt: true,
                attachmentUrl: true,
                attachmentName: true,
                deletedBySender: true,
                // Sender supabaseId — needed for audit-logging
                // attachment views (the sender is the doc "owner").
                sender: { select: { supabaseId: true } },
            },
        });

        // Auto-mark unread messages as read (messages sent TO me)
        await prisma.employerMessage.updateMany({
            where: {
                conversationId: id,
                recipientId: profile.id,
                readAt: null,
            },
            data: { readAt: new Date() },
        });

        const otherUser = conversation.participantA === profile.id ? conversation.userB : conversation.userA;
        const otherName = [otherUser.firstName, otherUser.lastName].filter(Boolean).join(' ')
            || otherUser.company
            || (otherUser.email ? otherUser.email.split('@')[0] : 'User');
        const initials = otherUser.firstName
            ? `${otherUser.firstName.charAt(0)}${(otherUser.lastName || '').charAt(0)}`.toUpperCase()
            : otherName.charAt(0).toUpperCase();

        return NextResponse.json({
            conversation: {
                id: conversation.id,
                subject: conversation.subject,
                jobTitle: conversation.job?.title || null,
                jobSlug: conversation.job?.slug || null,
                otherUser: {
                    id: otherUser.id,
                    supabaseId: otherUser.supabaseId,
                    name: otherName,
                    company: otherUser.company,
                    role: otherUser.role,
                    avatarUrl: otherUser.avatarUrl,
                    headline: otherUser.headline || null,
                    specialties: otherUser.specialties || null,
                    licenseStates: otherUser.licenseStates || null,
                    initials,
                },
            },
            messages: await Promise.all(messages.map(async (m) => {
                // Check if sender deleted this message
                const isSenderDeleted = m.senderId !== profile.id && m.deletedBySender;

                // Mint a fresh 15-min signed URL via the centralized
                // helper (audit-logged with audience='owner' when the
                // sender is fetching their own thread, 'counterparty'
                // for the other party).
                let resolvedAttachmentUrl: string | null = isSenderDeleted ? null : (m.attachmentUrl || null);
                if (resolvedAttachmentUrl) {
                    const isFromMe = m.senderId === profile.id;
                    resolvedAttachmentUrl = await mintDocReadUrl(
                        resolvedAttachmentUrl,
                        'message_attachment',
                        {
                            actorId: user.id,
                            ownerId: m.sender?.supabaseId ?? user.id,
                            audience: isFromMe ? 'owner' : 'counterparty',
                            action: 'view',
                            ...extractRequestContext(req),
                            reason: `conversation thread message ${m.id}`,
                        },
                    );
                }

                return {
                    id: m.id,
                    body: isSenderDeleted ? '' : m.body,
                    sentAt: m.sentAt.toISOString(),
                    isFromMe: m.senderId === profile.id,
                    readAt: m.readAt?.toISOString() || null,
                    editedAt: m.editedAt?.toISOString() || null,
                    attachmentUrl: resolvedAttachmentUrl,
                    attachmentName: isSenderDeleted ? null : (m.attachmentName || null),
                    isDeleted: isSenderDeleted,
                };
            })),
            myProfileId: profile.id,
        });
    } catch (error) {
        console.error('Error fetching conversation:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/conversations/[id]
 * Send a reply within an existing conversation.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    // CSRF protection
    const csrfError = verifyCsrf(req);
    if (csrfError) return csrfError;

    // Rate limiting — 20 messages/min
    const rateLimitResult = await rateLimit(req, 'message-send', { limit: 20, windowSeconds: 60 });
    if (rateLimitResult) return rateLimitResult;

    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true, firstName: true, lastName: true, company: true, role: true },
        });
        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        // Verify conversation exists and user is a participant
        const conversation = await prisma.conversation.findUnique({
            where: { id },
            include: {
                userA: { select: { id: true, email: true, firstName: true } },
                userB: { select: { id: true, email: true, firstName: true } },
            },
        });

        if (!conversation) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        if (conversation.participantA !== profile.id && conversation.participantB !== profile.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // LinkedIn-style reply gating: if a candidate initiated this conversation
        // and the employer hasn't replied yet, block follow-up messages.
        // This only applies to job_seekers — employers can always reply.
        if (profile.role === 'job_seeker') {
            const recipientId = conversation.participantA === profile.id
                ? conversation.participantB
                : conversation.participantA;

            // Check if the other party (employer) has ever sent a message in this conversation
            const employerReplyCount = await prisma.employerMessage.count({
                where: {
                    conversationId: id,
                    senderId: recipientId,
                },
            });

            if (employerReplyCount === 0) {
                return NextResponse.json({
                    error: 'Please wait for the employer to respond before sending another message',
                    awaitingReply: true,
                }, { status: 403 });
            }
        }

        const body = await req.json();
        const { body: messageBody, attachmentUrl, attachmentName } = body;

        if ((!messageBody || !messageBody.trim()) && !attachmentUrl) {
            return NextResponse.json({ error: 'Message body or attachment is required' }, { status: 400 });
        }

        if (messageBody && messageBody.length > 2000) {
            return NextResponse.json({ error: 'Message must be under 2000 characters' }, { status: 400 });
        }

        // Determine recipient
        const recipientProfile = conversation.participantA === profile.id
            ? conversation.userB
            : conversation.userA;

        // Create the reply message
        const message = await prisma.employerMessage.create({
            data: {
                senderId: profile.id,
                recipientId: recipientProfile.id,
                conversationId: id,
                subject: conversation.subject,
                body: sanitizeText((messageBody || '').trim(), 2000),
                ...(attachmentUrl && { attachmentUrl }),
                ...(attachmentName && { attachmentName }),
                ...(conversation.jobId && { jobId: conversation.jobId }),
            },
        });

        // Update conversation's lastMessageAt + un-delete for both users
        await prisma.conversation.update({
            where: { id },
            data: {
                lastMessageAt: new Date(),
                deletedByA: false,
                deletedByB: false,
            },
        });

        // Send email notification only if recipient has NO existing unread messages
        // in this conversation (prevents spam when sender sends multiple messages in a row)
        const senderName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'A user';
        if (recipientProfile.email) {
            const existingUnread = await prisma.employerMessage.count({
                where: {
                    conversationId: id,
                    senderId: profile.id,
                    recipientId: recipientProfile.id,
                    readAt: null,
                    id: { not: message.id }, // exclude the message we just created
                },
            });

            if (existingUnread === 0) {
                const msgPreview = (messageBody || '').trim() || (attachmentName ? `📎 ${attachmentName}` : '');

                if (profile.role === 'job_seeker') {
                    // Candidate → Employer: use candidate inquiry notification
                    sendCandidateInquiryNotification(
                        recipientProfile.email,
                        recipientProfile.firstName,
                        senderName,
                        conversation.subject,
                        msgPreview,
                        null, // jobTitle not available in conversation context
                    ).catch(err => console.error('Email notification error:', err));
                } else {
                    // Employer → Candidate: use employer message notification
                    sendEmployerMessageNotification(
                        recipientProfile.email,
                        recipientProfile.firstName,
                        senderName,
                        profile.company,
                        conversation.subject,
                        msgPreview,
                        null,
                    ).catch(err => console.error('Email notification error:', err));
                }
            }
        }

        // Mint a signed URL for the just-sent attachment via the
        // centralized helper. Sender is the actor here (POST = compose),
        // and they're also the doc owner — audit-logged as 'owner'.
        let resolvedAttachmentUrl: string | null = message.attachmentUrl || null;
        if (resolvedAttachmentUrl) {
            resolvedAttachmentUrl = await mintDocReadUrl(
                resolvedAttachmentUrl,
                'message_attachment',
                {
                    actorId: user.id,
                    ownerId: user.id,
                    audience: 'owner',
                    action: 'view',
                    ...extractRequestContext(req),
                    reason: `compose echo — message ${message.id}`,
                },
            );
        }

        return NextResponse.json({
            success: true,
            message: {
                id: message.id,
                body: message.body,
                sentAt: message.sentAt.toISOString(),
                isFromMe: true,
                attachmentUrl: resolvedAttachmentUrl,
                attachmentName: message.attachmentName || null,
            },
        });
    } catch (error) {
        console.error('Error sending reply:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/conversations/[id]
 * Soft-delete a conversation for the current user.
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true },
        });

        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        const conversation = await prisma.conversation.findUnique({
            where: { id },
            select: { participantA: true, participantB: true },
        });

        if (!conversation) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        const isParticipantA = conversation.participantA === profile.id;
        const isParticipantB = conversation.participantB === profile.id;

        if (!isParticipantA && !isParticipantB) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        await prisma.conversation.update({
            where: { id },
            data: isParticipantA
                ? { deletedByA: true }
                : { deletedByB: true },
        });

        return NextResponse.json({ deleted: true });
    } catch (error) {
        console.error('Error deleting conversation:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
