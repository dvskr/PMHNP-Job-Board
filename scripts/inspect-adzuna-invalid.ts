
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function inspectInvalidAdzunaJobs() {
    console.log('Fetching Adzuna jobs...');

    // Fetch a batch of Adzuna jobs
    const jobs = await prisma.job.findMany({
        where: {
            sourceProvider: 'adzuna',
            isPublished: true,
        },
        take: 500, // Check a sample of 500
        orderBy: {
            createdAt: 'desc',
        },
        select: {
            id: true,
            title: true,
            description: true,
            employer: true,
        }
    });

    const keywords = [
        'pmhnp',
        'psychiatric nurse',
        'psych np',
        'mental health nurse practitioner',
        'psychiatric mental health',
        'psych mental health',
        'psychiatric aprn',
        'pmhnp-bc',
        'psychiatric prescriber',
        'behavioral health nurse practitioner',
        'behavioral health np',
        'psych nurse practitioner',
    ];

    const invalidJobs = jobs.filter(job => {
        const text = `${job.title} ${job.description}`.toLowerCase();
        return !keywords.some(kw => text.includes(kw));
    });

    console.log(`\nChecked ${jobs.length} Adzuna jobs.`);
    console.log(`Found ${invalidJobs.length} INVALID jobs based on keywords.\n`);

    if (invalidJobs.length > 0) {
        console.log('--- SAMPLE OF INVALID JOBS ---');
        invalidJobs.slice(0, 20).forEach((job, i) => {
            console.log(`\n${i + 1}. Title: ${job.title}`);
            console.log(`   Employer: ${job.employer}`);
            // Show snippet of description to see context
            const snippet = job.description.replace(/\s+/g, ' ').substring(0, 150);
            console.log(`   Snippet: ${snippet}...`);
        });
    } else {
        console.log('No invalid jobs found in this sample! The dev DB might be clean or different from prod.');
    }

    await prisma.$disconnect();
}

inspectInvalidAdzunaJobs().catch(e => {
    console.error(e);
    process.exit(1);
});
