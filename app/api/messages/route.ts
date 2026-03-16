import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// GET — Fetch messages received by the logged-in user
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true },
        });
        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        const messages = await prisma.employerMessage.findMany({
            where: { recipientId: profile.id },
            orderBy: { sentAt: 'desc' },
            include: {
                sender: {
                    select: {
                        firstName: true,
                        lastName: true,
                        company: true,
                    },
                },
                job: {
                    select: {
                        title: true,
                        slug: true,
                    },
                },
            },
        });

        return NextResponse.json({
            messages: messages.map(m => ({
                id: m.id,
                subject: m.subject,
                body: m.body,
                sentAt: m.sentAt.toISOString(),
                readAt: m.readAt?.toISOString() || null,
                senderName: [m.sender.firstName, m.sender.lastName].filter(Boolean).join(' ') || 'Employer',
                senderCompany: m.sender.company || null,
                jobTitle: m.job?.title || null,
                jobSlug: m.job?.slug || null,
            })),
            unreadCount: messages.filter(m => !m.readAt).length,
        });
    } catch (error) {
        console.error('Error fetching messages:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PATCH — Mark a message as read
export async function PATCH(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true },
        });
        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        const { messageId } = await req.json();
        if (!messageId) {
            return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
        }

        // Verify the message belongs to this user
        const message = await prisma.employerMessage.findFirst({
            where: { id: messageId, recipientId: profile.id },
        });
        if (!message) {
            return NextResponse.json({ error: 'Message not found' }, { status: 404 });
        }

        if (!message.readAt) {
            await prisma.employerMessage.update({
                where: { id: messageId },
                data: { readAt: new Date() },
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error marking message as read:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
