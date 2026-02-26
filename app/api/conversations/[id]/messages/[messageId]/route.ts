import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// DELETE /api/conversations/[id]/messages/[messageId]
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; messageId: string }> },
) {
    try {
        const { id, messageId } = await params;

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
                recipientId: true,
                conversationId: true,
                readAt: true,
            },
        });

        if (!message) {
            return NextResponse.json({ error: 'Message not found' }, { status: 404 });
        }

        // Must belong to this conversation
        if (message.conversationId !== id) {
            return NextResponse.json({ error: 'Message not in this conversation' }, { status: 400 });
        }

        // User must be the sender to delete
        if (message.senderId !== profile.id) {
            return NextResponse.json({ error: 'You can only delete your own messages' }, { status: 403 });
        }

        // Business rule: if unread → delete for both; if read → delete for sender only
        const deletedForBoth = !message.readAt;

        await prisma.employerMessage.update({
            where: { id: messageId },
            data: {
                deletedBySender: true,
                ...(deletedForBoth && { deletedByRecipient: true }),
            },
        });

        return NextResponse.json({
            deleted: true,
            deletedForBoth,
        });
    } catch (error) {
        console.error('Error deleting message:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
