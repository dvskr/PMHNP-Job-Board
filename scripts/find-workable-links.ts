
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function findWorkable() {
    const jobs = await prisma.job.findMany({
        where: {
            applyLink: {
                contains: 'workable.com'
            }
        },
        select: {
            applyLink: true,
            employer: true,
            sourceProvider: true
        },
        take: 20
    });

    console.log(`Found ${jobs.length} jobs with Workable links:`);
    jobs.forEach(j => {
        console.log(`- [${j.sourceProvider}] ${j.employer}: ${j.applyLink}`);
    });
}

findWorkable()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
