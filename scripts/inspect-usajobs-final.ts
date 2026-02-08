
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function main() {
    const jobs = await prisma.job.findMany({
        where: { sourceProvider: 'usajobs' },
        take: 10,
        orderBy: { createdAt: 'desc' }
    });

    console.log(`🔍 Inspecting ${jobs.length} USAJobs:`);
    for (const job of jobs) {
        console.log(`\n- Title: ${job.title}`);
        console.log(`  Employer: ${job.employer}`);
        console.log(`  Location: ${job.location}`);
        console.log(`  Salary: ${job.displaySalary}`);
        console.log(`  Description (start): ${job.description.substring(0, 100)}...`);
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
