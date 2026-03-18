// Use the project's prisma instance
import { prisma } from './lib/prisma.ts';

async function main() {
    // Find the user profile for Sathish (job seeker)
    const sathish = await prisma.userProfile.findFirst({
        where: { email: { contains: 'daggulasatish' } },
        select: { id: true, email: true, firstName: true, role: true }
    });
    console.log('Sathish profile:', sathish);

    if (!sathish) {
        console.log('Sathish not found');
        return;
    }

    // Find all conversations involving Sathish
    const conversations = await prisma.conversation.findMany({
        where: {
            OR: [
                { participantA: sathish.id },
                { participantB: sathish.id },
            ]
        },
        include: {
            userA: { select: { id: true, firstName: true, company: true, role: true } },
            userB: { select: { id: true, firstName: true, company: true, role: true } },
            job: { select: { id: true, title: true } },
        },
        orderBy: { lastMessageAt: 'desc' }
    });

    console.log(`\n=== ${conversations.length} Conversations ===`);
    for (const conv of conversations) {
        console.log(`\nConv ${conv.id}:`);
        console.log(`  Subject: ${conv.subject}`);
        console.log(`  Job: ${conv.job?.title || 'none'}`);
        console.log(`  deletedByA: ${conv.deletedByA}, deletedByB: ${conv.deletedByB}`);
        console.log(`  UserA: ${conv.userA.firstName} (${conv.userA.role}) id=${conv.participantA}`);
        console.log(`  UserB: ${conv.userB.firstName} (${conv.userB.role}) id=${conv.participantB}`);

        // Get ALL messages in this conversation  (no filters)
        const messages = await prisma.employerMessage.findMany({
            where: { conversationId: conv.id },
            orderBy: { sentAt: 'asc' },
            select: {
                id: true,
                senderId: true,
                recipientId: true,
                body: true,
                sentAt: true,
                deletedBySender: true,
                deletedByRecipient: true,
            }
        });
        console.log(`  Total messages (unfiltered): ${messages.length}`);
        for (const msg of messages) {
            const isSathish = msg.senderId === sathish.id;
            console.log(`    [${msg.sentAt.toISOString()}] ${isSathish ? 'SATHISH→' : '→SATHISH'}: "${msg.body.substring(0, 60)}" delBySender=${msg.deletedBySender} delByRecip=${msg.deletedByRecipient}`);
        }
    }

    // Also check for ANY EmployerMessage where Sathish is sender but no conversationId
    const orphanMsgs = await prisma.employerMessage.findMany({
        where: {
            senderId: sathish.id,
            conversationId: null,
        },
        select: { id: true, body: true, sentAt: true, subject: true }
    });
    console.log(`\n=== Orphan messages (no conversationId): ${orphanMsgs.length} ===`);
    for (const msg of orphanMsgs) {
        console.log(`  ${msg.sentAt.toISOString()}: "${msg.body.substring(0, 60)}" subj: ${msg.subject}`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
