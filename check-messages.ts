import 'dotenv/config';
import { prisma } from './lib/prisma.js';

async function main() {
    const sathish = await prisma.userProfile.findFirst({
        where: { email: { contains: 'daggulasatish' } },
        select: { id: true, email: true, firstName: true, role: true }
    });
    console.log('Sathish profile:', sathish);
    if (!sathish) { console.log('Not found'); return; }

    const conversations = await prisma.conversation.findMany({
        where: { OR: [{ participantA: sathish.id }, { participantB: sathish.id }] },
        include: {
            userA: { select: { id: true, firstName: true, company: true, role: true } },
            userB: { select: { id: true, firstName: true, company: true, role: true } },
            job: { select: { id: true, title: true } },
        },
        orderBy: { lastMessageAt: 'desc' }
    });

    console.log(`\n=== ${conversations.length} Conversations ===`);
    for (const conv of conversations) {
        console.log(`\nConv ${conv.id}: "${conv.subject}"`);
        console.log(`  Job: ${conv.job?.title || 'none'}`);
        console.log(`  A: ${conv.userA.firstName} (${conv.userA.role}), B: ${conv.userB.firstName} (${conv.userB.role})`);

        const messages = await prisma.employerMessage.findMany({
            where: { conversationId: conv.id },
            orderBy: { sentAt: 'asc' },
            select: { id: true, senderId: true, body: true, sentAt: true, deletedBySender: true, deletedByRecipient: true }
        });
        console.log(`  Messages: ${messages.length}`);
        for (const msg of messages) {
            const who = msg.senderId === sathish.id ? 'SATHISH→' : '→SATHISH';
            console.log(`    ${who}: "${msg.body.substring(0, 60)}" del_s=${msg.deletedBySender} del_r=${msg.deletedByRecipient}`);
        }
    }

    const orphans = await prisma.employerMessage.findMany({
        where: { senderId: sathish.id, conversationId: null },
        select: { id: true, body: true, sentAt: true, subject: true }
    });
    console.log(`\nOrphan msgs (no convId): ${orphans.length}`);
    orphans.forEach(m => console.log(`  "${m.body.substring(0, 60)}" subj: ${m.subject}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
