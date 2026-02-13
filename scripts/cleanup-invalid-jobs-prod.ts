
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { isRelevantJob } from '../lib/utils/job-filter';

const prodUrl = process.env.PROD_DATABASE_URL;
if (!prodUrl) {
    console.error('❌ PROD_DATABASE_URL not set in .env');
    process.exit(1);
}

console.log('🔗 Connecting to PRODUCTION database...');
const pool = new Pool({ connectionString: prodUrl, max: 3, allowExitOnIdle: true });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function cleanupInvalidJobs() {
    console.log('🧹 Starting Cleanup of Invalid Jobs in PROD...');
    console.log('Using strict PMHNP filter logic...\n');

    const totalJobs = await prisma.job.count();
    console.log(`Total jobs in database: ${totalJobs}`);

    const allJobs = await prisma.job.findMany({
        select: {
            id: true,
            title: true,
            description: true,
            sourceProvider: true,
        }
    });

    const toDelete: string[] = [];

    for (const job of allJobs) {
        // EXEMPT: Never delete employer postings (sourceProvider: null)
        if (job.sourceProvider !== null && !isRelevantJob(job.title, job.description)) {
            toDelete.push(job.id);
        }
    }

    console.log(`Found ${toDelete.length} invalid jobs to delete.`);

    if (toDelete.length === 0) {
        console.log('✨ Database is already clean! No action needed.');
        return;
    }

    console.log(`Deleting ${toDelete.length} jobs...`);

    // Delete in chunks of 500
    const chunkSize = 500;
    for (let i = 0; i < toDelete.length; i += chunkSize) {
        const chunk = toDelete.slice(i, i + chunkSize);
        await prisma.job.deleteMany({
            where: { id: { in: chunk } }
        });
        console.log(`  Deleted chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(toDelete.length / chunkSize)} (${Math.min(i + chunkSize, toDelete.length)}/${toDelete.length})`);
    }

    const remainingJobs = await prisma.job.count();
    console.log(`\n✅ Cleanup Complete! Deleted ${toDelete.length} invalid jobs.`);
    console.log(`Remaining jobs in database: ${remainingJobs}`);

    await prisma.$disconnect();
    await pool.end();
}

cleanupInvalidJobs().catch(e => {
    console.error('Error during cleanup:', e);
    process.exit(1);
});
