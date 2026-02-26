import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/conversations
 * List all conversations for the logged-in user (employer OR candidate).
 * Returns conversations with the other participant's info, last message preview, and unread count.
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true, role: true },
        });
        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        // Find all conversations where this user is either participantA or participantB
        const conversations = await prisma.conversation.findMany({
            where: {
                OR: [
                    { participantA: profile.id, deletedByA: false },
                    { participantB: profile.id, deletedByB: false },
                ],
            },
            include: {
                userA: { select: { id: true, supabaseId: true, firstName: true, lastName: true, company: true, role: true, avatarUrl: true, email: true, headline: true, specialties: true, licenseStates: true } },
                userB: { select: { id: true, supabaseId: true, firstName: true, lastName: true, company: true, role: true, avatarUrl: true, email: true, headline: true, specialties: true, licenseStates: true } },
                job: { select: { id: true, title: true, slug: true } },
                messages: {
                    orderBy: { sentAt: 'desc' },
                    take: 1,
                    select: { body: true, sentAt: true, senderId: true },
                },
            },
            orderBy: { lastMessageAt: 'desc' },
        });

        // Get unread counts per conversation
        const unreadCounts = await prisma.employerMessage.groupBy({
            by: ['conversationId'],
            where: {
                recipientId: profile.id,
                readAt: null,
                conversationId: { not: null },
            },
            _count: { id: true },
        });

        const unreadMap = new Map(unreadCounts.map(u => [u.conversationId, u._count.id]));

        const formatted = conversations.map(conv => {
            const otherUser = conv.participantA === profile.id ? conv.userB : conv.userA;
            const lastMsg = conv.messages[0] || null;
            const otherName = [otherUser.firstName, otherUser.lastName].filter(Boolean).join(' ')
                || otherUser.company
                || (otherUser.email ? otherUser.email.split('@')[0] : 'User');
            const initials = otherUser.firstName
                ? `${otherUser.firstName.charAt(0)}${(otherUser.lastName || '').charAt(0)}`.toUpperCase()
                : otherName.charAt(0).toUpperCase();

            return {
                id: conv.id,
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
                subject: conv.subject,
                jobTitle: conv.job?.title || null,
                jobSlug: conv.job?.slug || null,
                lastMessage: lastMsg ? {
                    preview: lastMsg.body.substring(0, 120) + (lastMsg.body.length > 120 ? '…' : ''),
                    sentAt: lastMsg.sentAt.toISOString(),
                    isFromMe: lastMsg.senderId === profile.id,
                } : null,
                unreadCount: unreadMap.get(conv.id) || 0,
                lastMessageAt: conv.lastMessageAt.toISOString(),
                createdAt: conv.createdAt.toISOString(),
            };
        });

        const totalUnread = Array.from(unreadMap.values()).reduce((sum, c) => sum + c, 0);

        return NextResponse.json({ conversations: formatted, totalUnread });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
