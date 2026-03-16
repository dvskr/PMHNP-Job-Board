
import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { isRelevantJob } from '../lib/utils/job-filter';

async function cleanupInvalidJobs() {
    console.log('🧹 Starting Cleanup of Invalid Jobs...');
    console.log('Using strict PMHNP filter logic...\n');

    const totalJobs = await prisma.job.count();
    console.log(`Total jobs in database: ${totalJobs}`);

    // Fetch all jobs (we might need to chunk this if the DB is huge, but for 13k it should be fine)
    const allJobs = await prisma.job.findMany({
        select: {
            id: true,
            title: true,
            description: true,
            sourceProvider: true
        }
    });

    const toDelete: string[] = [];

    for (const job of allJobs) {
        // EXEMPT: Never delete employer postings (sourceProvider: null)
        if (job.sourceProvider !== null && !isRelevantJob(job.title, job.description)) {
            toDelete.push(job.id);
        }
    }

    console.log(`Found ${toDelete.length} jobs that no longer match our strict criteria.`);

    if (toDelete.length === 0) {
        console.log('✨ Database is already clean! No action needed.');
        return;
    }

    // Confirmation step is implied as this is being run by the agent on Dev
    console.log(`Deleting ${toDelete.length} jobs...`);

    // Delete in chunks of 500 to avoid long-running transactions
    const chunkSize = 500;
    for (let i = 0; i < toDelete.length; i += chunkSize) {
        const chunk = toDelete.slice(i, i + chunkSize);
        await prisma.job.deleteMany({
            where: {
                id: {
                    in: chunk
                }
            }
        });
        process.stdout.write(`.`);
    }

    console.log(`\n\n✅ Cleanup Complete! Deleted ${toDelete.length} invalid jobs.`);

    const remainingJobs = await prisma.job.count();
    console.log(`Remaining jobs in database: ${remainingJobs}`);

    await prisma.$disconnect();
}

cleanupInvalidJobs().catch(e => {
    console.error('Error during cleanup:', e);
    process.exit(1);
});
