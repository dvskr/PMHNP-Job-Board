import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// PATCH /api/conversations/[id]/messages/[messageId]
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; messageId: string }> },
) {
    try {
        const { id, messageId } = await params;
        const { body } = await req.json();

        if (!body || typeof body !== 'string' || body.trim().length === 0) {
            return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
        }

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

        // Fetch the message
        const message = await prisma.employerMessage.findUnique({
            where: { id: messageId },
            select: {
                id: true,
                senderId: true,
                conversationId: true,
                readAt: true,
                deletedBySender: true,
            },
        });

        if (!message) {
            return NextResponse.json({ error: 'Message not found' }, { status: 404 });
        }

        // Must belong to this conversation
        if (message.conversationId !== id) {
            return NextResponse.json({ error: 'Message not in this conversation' }, { status: 400 });
        }

        // Only the sender can edit
        if (message.senderId !== profile.id) {
            return NextResponse.json({ error: 'You can only edit your own messages' }, { status: 403 });
        }

        // Can't edit a deleted message
        if (message.deletedBySender) {
            return NextResponse.json({ error: 'Cannot edit a deleted message' }, { status: 400 });
        }

        // Update the message body + set editedAt
        const updated = await prisma.employerMessage.update({
            where: { id: messageId },
            data: {
                body: body.trim(),
                editedAt: new Date(),
            },
            select: {
                id: true,
                body: true,
                editedAt: true,
                readAt: true,
            },
        });

        return NextResponse.json({
            edited: true,
            message: {
                id: updated.id,
                body: updated.body,
                editedAt: updated.editedAt?.toISOString() || null,
                wasRead: !!updated.readAt,
            },
        });
    } catch (error) {
        console.error('Error editing message:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
