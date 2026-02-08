
import 'dotenv/config';
import { prisma } from '../lib/prisma';

// Regex for valid PMHNP jobs
const regexPattern = 'pmhnp|psychiatric nurse|psych np|mental health nurse practitioner|psychiatric mental health|psych mental health|psychiatric aprn|pmhnp-bc|psychiatric prescriber|behavioral health nurse practitioner|behavioral health np|psych nurse practitioner';

async function showInvalidSamples() {
    console.log('🔍 Showing INVALID Jobs from Adzuna & USAJobs...\n');
    console.log('Criteria: Job Title OR Description must contain at least one PMHNP keyword.');
    console.log('----------------------------------------------------------------\n');

    // 1. Adzuna Samples
    const adzunaSamples: any = await prisma.$queryRaw`
        SELECT title, employer 
        FROM jobs 
        WHERE source_provider = 'adzuna' 
        AND is_published = true
        AND NOT (title ~* ${regexPattern} OR description ~* ${regexPattern})
        LIMIT 20
    `;

    console.log('--- INVALID ADZUNA JOBS (20 Samples) ---');
    if (adzunaSamples.length > 0) {
        adzunaSamples.forEach((job: any, i: number) => {
            console.log(`${i + 1}. [${job.title}] @ ${job.employer}`);
        });
    } else {
        console.log('No invalid Adzuna jobs found.');
    }

    // 2. USAJobs Samples
    const usaSamples: any = await prisma.$queryRaw`
        SELECT title, employer 
        FROM jobs 
        WHERE source_provider = 'usajobs' 
        AND is_published = true
        AND NOT (title ~* ${regexPattern} OR description ~* ${regexPattern})
        LIMIT 20
    `;

    console.log('\n--- INVALID USAJOBS JOBS (20 Samples) ---');
    if (usaSamples.length > 0) {
        usaSamples.forEach((job: any, i: number) => {
            console.log(`${i + 1}. [${job.title}] @ ${job.employer}`);
        });
    } else {
        console.log('No invalid USAJobs jobs found.');
    }

    await prisma.$disconnect();
}

showInvalidSamples().catch(e => {
    console.error(e);
    process.exit(1);
});
