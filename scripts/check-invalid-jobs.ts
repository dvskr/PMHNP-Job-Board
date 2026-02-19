
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

async function checkInvalidJobs() {
    console.log('🔍 Checking for Invalid Jobs in PROD (DRY RUN)...');
    console.log('Using strict PMHNP filter logic...\n');

    const totalJobs = await prisma.job.count();
    console.log(`Total jobs in database: ${totalJobs}`);

    const allJobs = await prisma.job.findMany({
        select: {
            id: true,
            title: true,
            description: true,
            employer: true,
            sourceProvider: true,
            createdAt: true,
        }
    });

    const invalidJobs: typeof allJobs = [];
    const exemptEmployerJobs: typeof allJobs = [];

    for (const job of allJobs) {
        if (!isRelevantJob(job.title, job.description)) {
            if (job.sourceProvider === null) {
                exemptEmployerJobs.push(job);
            } else {
                invalidJobs.push(job);
            }
        }
    }

    console.log(`\n📊 Results:`);
    console.log(`  ✅ Valid jobs: ${totalJobs - invalidJobs.length - exemptEmployerJobs.length}`);
    console.log(`  ❌ Invalid aggregated jobs: ${invalidJobs.length}`);
    console.log(`  🛡️  Exempt employer postings (would not match filter but are employer-posted): ${exemptEmployerJobs.length}`);

    if (invalidJobs.length > 0) {
        // Group by source provider
        const bySource: Record<string, number> = {};
        for (const job of invalidJobs) {
            const src = job.sourceProvider || 'unknown';
            bySource[src] = (bySource[src] || 0) + 1;
        }
        console.log(`\n📦 Invalid jobs by source:`);
        for (const [src, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
            console.log(`  ${src}: ${count}`);
        }

        // Show sample invalid jobs
        const sampleSize = Math.min(25, invalidJobs.length);
        console.log(`\n📋 Sample invalid jobs (showing ${sampleSize} of ${invalidJobs.length}):`);
        for (const job of invalidJobs.slice(0, sampleSize)) {
            console.log(`  - [${job.sourceProvider}] "${job.title}" by ${job.employer}`);
        }
    }

    if (exemptEmployerJobs.length > 0) {
        console.log(`\n🛡️  Exempt employer postings that don't match filter:`);
        for (const job of exemptEmployerJobs) {
            console.log(`  - "${job.title}" by ${job.employer}`);
        }
    }

    console.log(`\n✨ Done! This was a dry run — no jobs were deleted.`);
    await prisma.$disconnect();
    await pool.end();
}

checkInvalidJobs().catch(e => {
    console.error('Error during check:', e);
    process.exit(1);
});
