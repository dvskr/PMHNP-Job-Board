import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function checkJobs() {
    console.log('Querying jobs...');

    const job1 = await prisma.job.findFirst({
        where: {
            title: { contains: 'Jesup' }
        },
        select: {
            id: true,
            title: true,
            employer: true,
            originalPostedAt: true,
            createdAt: true
        }
    });
    console.log('Job 1 (Jesup):', job1);

    const job2 = await prisma.job.findFirst({
        where: {
            title: { contains: 'Intake Psychiatric' }
        },
        select: {
            id: true,
            title: true,
            employer: true,
            originalPostedAt: true,
            createdAt: true
        }
    });
    console.log('Job 2 (Intake):', job2);

    const job3 = await prisma.job.findFirst({
        where: {
            title: { contains: 'Rula' }
        },
        select: {
            id: true,
            title: true,
            employer: true,
            originalPostedAt: true,
            createdAt: true
        }
    });
    console.log('Job 3 (Rula):', job3);

}

checkJobs()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
