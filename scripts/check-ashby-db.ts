
import { prisma } from '../lib/prisma';

async function checkAshbyJobs() {
    const jobs = await prisma.job.findMany({
        where: { sourceProvider: 'ashby' },
        select: { title: true, employer: true, description: true }
    });

    console.log(`\n--- Ashby Jobs in DB (${jobs.length}) ---`);
    jobs.forEach(j => {
        console.log(`Employer: ${j.employer} | Title: ${j.title}`);
    });
}

checkAshbyJobs();
