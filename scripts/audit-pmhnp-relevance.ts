
import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { isRelevantJob } from '../lib/utils/job-filter';

async function audit() {
    console.log('🧐 Auditing USAJobs for PMHNP Relevance...');

    const jobs = await prisma.job.findMany({
        where: { sourceProvider: 'usajobs' }
    });

    console.log(`Total USAJobs found: ${jobs.length}`);

    for (const job of jobs) {
        const isRelevant = isRelevantJob(job.title, job.description);
        const status = isRelevant ? '✅ RELEVANT' : '❌ FILTERED';
        console.log(`[${status}] ${job.title} (${job.location})`);
        if (!isRelevant) {
            // console.log(`   Reason: Does not meet tightened criteria.`);
        }
    }
}

audit().catch(console.error).finally(() => prisma.$disconnect());
