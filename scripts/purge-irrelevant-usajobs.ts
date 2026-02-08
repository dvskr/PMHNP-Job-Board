
import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { isRelevantJob } from '../lib/utils/job-filter';

async function purge() {
    console.log('🧹 Purging Irrelevant USAJobs...');

    const jobs = await prisma.job.findMany({
        where: { sourceProvider: 'usajobs' }
    });

    let purgedCount = 0;

    for (const job of jobs) {
        if (!isRelevantJob(job.title, job.description)) {
            console.log(`🗑️  DELETING: ${job.title}`);
            await prisma.job.delete({ where: { id: job.id } });
            purgedCount++;
        }
    }

    console.log(`\n✅ Purge complete. Removed ${purgedCount} jobs.`);

    const finalCount = await prisma.job.count({
        where: { sourceProvider: 'usajobs' }
    });
    console.log(`📊 Final USAJobs in DB: ${finalCount}`);
}

purge().catch(console.error).finally(() => prisma.$disconnect());
