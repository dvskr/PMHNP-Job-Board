/**
 * Cleanup script: Delete all jobs from the database
 * Usage: npx tsx scripts/clean-all-jobs.ts
 */
import 'dotenv/config';

import { prisma } from '../lib/prisma';

async function main() {
    const count = await prisma.job.count();
    console.log(`Current job count: ${count}`);

    if (count === 0) {
        console.log('No jobs to delete.');
        return;
    }

    // Delete apply clicks first (FK constraint)
    const clicksDeleted = await prisma.applyClick.deleteMany({});
    console.log(`Deleted ${clicksDeleted.count} apply clicks`);

    // Delete job applications (FK constraint)
    const appsDeleted = await prisma.jobApplication.deleteMany({});
    console.log(`Deleted ${appsDeleted.count} job applications`);

    // Delete employer jobs (FK constraint)
    const empJobsDeleted = await prisma.employerJob.deleteMany({});
    console.log(`Deleted ${empJobsDeleted.count} employer jobs`);

    // Now delete all jobs
    const deleted = await prisma.job.deleteMany({});
    console.log(`Deleted ${deleted.count} jobs`);

    const after = await prisma.job.count();
    console.log(`Jobs remaining: ${after}`);
}

main()
    .catch(console.error)
    .finally(() => process.exit(0));
