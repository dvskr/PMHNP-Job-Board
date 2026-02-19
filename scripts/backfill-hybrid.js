require('dotenv').config({ path: ['.env.local', '.env'] });

const { PrismaClient } = require('@prisma/client');

async function main() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error('DATABASE_URL not set');
        process.exit(1);
    }
    console.log('Connecting to:', url.substring(0, 30) + '...');

    const prisma = new PrismaClient({
        datasourceUrl: url,
    });

    // Backfill: set isHybrid=true for all jobs where mode='Hybrid'
    const result = await prisma.job.updateMany({
        where: { mode: 'Hybrid', isHybrid: false },
        data: { isHybrid: true },
    });
    console.log(`Backfilled isHybrid=true for ${result.count} jobs`);

    // Also fix isRemote for jobs where mode='Remote' but isRemote=false
    const result2 = await prisma.job.updateMany({
        where: { mode: 'Remote', isRemote: false },
        data: { isRemote: true },
    });
    console.log(`Backfilled isRemote=true for ${result2.count} jobs`);

    await prisma.$disconnect();
}

main().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
