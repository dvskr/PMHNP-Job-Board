
import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { isRelevantJob } from '../lib/utils/job-filter';

async function purge() {
    const jobs = await prisma.job.findMany({
        select: { title: true, description: true, id: true }
    });

    console.log(`Scanning ${jobs.length} jobs against new filter rules...`);

    const toDelete: string[] = [];

    jobs.forEach(job => {
        if (!isRelevantJob(job.title, job.description)) {
            console.log(`[DELETE] ${job.title} (ID: ${job.id})`);
            toDelete.push(job.id);
        }
    });

    if (toDelete.length > 0) {
        const deleted = await prisma.job.deleteMany({
            where: {
                id: { in: toDelete }
            }
        });
        console.log(`\n✅ Purged ${deleted.count} irrelevant jobs.`);
    } else {
        console.log('\n✅ No irrelevant jobs found. Database is clean.');
    }
}

purge()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
