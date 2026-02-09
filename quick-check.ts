import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function run() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error('No DATABASE_URL found');
        process.exit(1);
    }

    const prisma = new PrismaClient({
        datasources: {
            db: {
                url,
            },
        },
    } as any);

    try {
        const total = await prisma.job.count();
        const published = await prisma.job.count({ where: { isPublished: true } });
        const withDate = await prisma.job.count({ where: { originalPostedAt: { not: null } } });
        console.log(JSON.stringify({ total, published, withDate }, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
run();
