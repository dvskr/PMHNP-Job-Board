
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function setAdminRole() {
    // Get email from command line args
    const email = process.argv[2];

    if (!email) {
        console.error('❌ Please provide an email address');
        console.log('Usage: npx tsx scripts/set-admin.ts <email>');
        process.exit(1);
    }

    try {
        console.log(`🔍 Looking for user with email: ${email}`);

        const user = await prisma.userProfile.findUnique({
            where: { email },
        });

        if (!user) {
            console.error('❌ User not found');
            // List all users to help
            const count = await prisma.userProfile.count();
            console.log(`There are ${count} users in the database.`);
            process.exit(1);
        }

        console.log(`👤 Found user: ${user.firstName || ''} ${user.lastName || ''} (${user.id})`);
        console.log(`   Current Role: ${user.role}`);

        if (user.role === 'admin') {
            console.log('✅ User is already an admin');
            await prisma.$disconnect();
            return;
        }

        const updated = await prisma.userProfile.update({
            where: { email },
            data: { role: 'admin' },
        });

        console.log(`✅ User role updated to: ${updated.role}`);

    } catch (error) {
        console.error('❌ Error updating user role:', error);
    } finally {
        await prisma.$disconnect();
    }
}

setAdminRole();
