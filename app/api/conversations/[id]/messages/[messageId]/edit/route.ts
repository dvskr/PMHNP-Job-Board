import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { sanitizeText } from '@/lib/sanitize';
import { verifyCsrf } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/app/api/_lib/json-body';

/**
 * Same ceiling the send path enforces (POST /api/conversations/[id]). An edit
 * that skipped it could rewrite an already-delivered message to any size,
 * which is both a stored-payload problem and a row-size one.
 */
const MESSAGE_MAX_LENGTH = 2000;

// PATCH /api/conversations/[id]/messages/[messageId]
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; messageId: string }> },
) {
    // Parity with the send path: this route writes the same column, so it
    // gets the same origin check, throttle, cap and sanitiser. Ownership
    // alone is not the control here: a cross-site page can act as the
    // signed-in sender, and the sender is exactly who is allowed to edit.
    const csrfError = verifyCsrf(req);
    if (csrfError) return csrfError;

    const rateLimitResult = await rateLimit(req, 'message-edit', { limit: 20, windowSeconds: 60 });
    if (rateLimitResult) return rateLimitResult;

    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;

    try {
        const { id, messageId } = await params;
        const { body } = parsed.body as { body?: unknown };

        if (!body || typeof body !== 'string' || body.trim().length === 0) {
            return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
        }

        if (body.length > MESSAGE_MAX_LENGTH) {
            return NextResponse.json(
                { error: `Message must be under ${MESSAGE_MAX_LENGTH} characters` },
                { status: 400 },
            );
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
                body: sanitizeText(body.trim(), MESSAGE_MAX_LENGTH),
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
