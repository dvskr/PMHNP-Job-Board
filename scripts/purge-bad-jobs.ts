import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function purge() {
    // 1. Unpublish the 1 irrelevant job
    const irrelevant = await prisma.job.updateMany({
        where: { title: { contains: 'Child Adolescent' }, sourceProvider: 'jsearch' },
        data: { isPublished: false }
    });
    console.log('Unpublished irrelevant:', irrelevant.count);

    // 2. Unpublish stale jobs (>90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const stale = await prisma.job.updateMany({
        where: { originalPostedAt: { lt: ninetyDaysAgo }, isPublished: true },
        data: { isPublished: false }
    });
    console.log('Unpublished stale:', stale.count);

    const total = await prisma.job.count({ where: { isPublished: true } });
    console.log('Total published jobs remaining:', total);
    process.exit(0);
}

purge();
