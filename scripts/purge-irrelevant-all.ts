
import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { isRelevantJob } from '../lib/utils/job-filter';

async function purge() {
    console.log('🧹 Purging Irrelevant Jobs across ALL sources...');

    const jobs = await prisma.job.findMany();

    let purgedCount = 0;
    const countsBySource: Record<string, number> = {};

    for (const job of jobs) {
        if (!isRelevantJob(job.title, job.description)) {
            console.log(`🗑️  DELETING [${job.sourceProvider}]: ${job.title}`);
            await prisma.job.delete({ where: { id: job.id } });
            purgedCount++;

            const source = job.sourceProvider || 'unknown';
            countsBySource[source] = (countsBySource[source] || 0) + 1;
        }
    }

    console.log(`\n✅ Purge complete. Removed ${purgedCount} jobs total.`);
    for (const [source, count] of Object.entries(countsBySource)) {
        console.log(`   - ${source}: ${count} removed`);
    }

    const finalTotal = await prisma.job.count();
    console.log(`📊 Final total jobs in DB: ${finalTotal}`);
}

purge().catch(console.error).finally(() => prisma.$disconnect());
