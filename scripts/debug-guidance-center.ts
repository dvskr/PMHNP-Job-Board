
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function main() {
    const jobs = await prisma.job.findMany({
        where: {
            employer: {
                contains: 'GUIDANCE CENTER',
                mode: 'insensitive'
            }
        }
    });

    console.log(`Found ${jobs.length} jobs.`);
    jobs.forEach(job => {
        console.log({
            id: job.id,
            title: job.title,
            employer: job.employer,
            createdAt: job.createdAt,
            originalPostedAt: job.originalPostedAt,
            descriptionSnippet: job.description.substring(0, 100)
        });
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
