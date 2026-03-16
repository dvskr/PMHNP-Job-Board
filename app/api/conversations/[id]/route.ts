import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';
import { sendEmployerMessageNotification } from '@/lib/email-service';
import { sanitizeText } from '@/lib/sanitize';
import { verifyCsrf } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';

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

                // Generate fresh signed URL for attachments stored as paths
                let resolvedAttachmentUrl = isSenderDeleted ? null : (m.attachmentUrl || null);
                if (resolvedAttachmentUrl && !resolvedAttachmentUrl.startsWith('http')) {
                    try {
                        const admin = createAdminClient(
                            process.env.NEXT_PUBLIC_SUPABASE_URL!,
                            process.env.SUPABASE_SERVICE_ROLE_KEY!
                        );
                        const { data: signedData } = await admin.storage
                            .from('message-attachments')
                            .createSignedUrl(resolvedAttachmentUrl, 3600); // 1 hour
                        if (signedData?.signedUrl) {
                            resolvedAttachmentUrl = signedData.signedUrl;
                        }
                    } catch {
                        // If signing fails, keep the raw path — better than nothing
                    }
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
            select: { id: true, firstName: true, lastName: true, company: true },
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
                sendEmployerMessageNotification(
                    recipientProfile.email,
                    recipientProfile.firstName,
                    senderName,
                    profile.company,
                    conversation.subject,
                    (messageBody || '').trim() || (attachmentName ? `📎 ${attachmentName}` : ''),
                    null,
                ).catch(err => console.error('Email notification error:', err));
            }
        }

        // Generate a signed URL for the attachment if it's a storage path
        let resolvedAttachmentUrl = message.attachmentUrl || null;
        if (resolvedAttachmentUrl && !resolvedAttachmentUrl.startsWith('http')) {
            try {
                const admin = createAdminClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.SUPABASE_SERVICE_ROLE_KEY!
                );
                const { data: signedData } = await admin.storage
                    .from('message-attachments')
                    .createSignedUrl(resolvedAttachmentUrl, 3600);
                if (signedData?.signedUrl) {
                    resolvedAttachmentUrl = signedData.signedUrl;
                }
            } catch {
                // Keep raw path as fallback
            }
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
