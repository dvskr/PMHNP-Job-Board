import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.PROD_DATABASE_URL;
if (!connectionString) {
    throw new Error('PROD_DATABASE_URL must be set in .env');
}

const pool = new Pool({ connectionString, max: 3 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function findInvalidJobs() {
    console.log('Connecting to PROD database...\n');

    // PMHNP-related keywords — jobs NOT matching any of these are suspicious
    const pmhnpKeywords = [
        'pmhnp', 'psychiatric', 'psych', 'mental health',
        'nurse practitioner', 'np', 'arnp', 'aprn',
        'behavioral health', 'psychiatry', 'counselor',
        'therapist', 'psychologist', 'substance abuse',
        'addiction', 'telepsychiatry', 'neuropsych',
    ];

    // Get all published jobs
    const allJobs = await prisma.job.findMany({
        where: { isPublished: true },
        select: {
            id: true,
            title: true,
            employer: true,
            city: true,
            state: true,
            sourceProvider: true,
            createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
    });

    console.log(`Total published jobs: ${allJobs.length}\n`);

    // Filter for jobs that don't match any PMHNP keyword in title
    const invalidJobs = allJobs.filter((job) => {
        const titleLower = job.title.toLowerCase();
        return !pmhnpKeywords.some((kw) => titleLower.includes(kw));
    });

    console.log(`Non-PMHNP jobs found: ${invalidJobs.length}\n`);
    console.log('='.repeat(120));

    // Group by source for easier analysis
    const bySource: Record<string, typeof invalidJobs> = {};
    for (const job of invalidJobs) {
        const src = job.sourceProvider || 'unknown';
        if (!bySource[src]) bySource[src] = [];
        bySource[src].push(job);
    }

    for (const [source, jobs] of Object.entries(bySource).sort((a, b) => b[1].length - a[1].length)) {
        console.log(`\n Source: ${source} (${jobs.length} invalid jobs)`);
        console.log('-'.repeat(120));
        for (const job of jobs.slice(0, 25)) {
            const loc = [job.city, job.state].filter(Boolean).join(', ') || 'No location';
            console.log(`  [${job.id.slice(0, 8)}] ${job.title.padEnd(60)} | ${job.employer?.slice(0, 25)?.padEnd(25) || 'N/A'.padEnd(25)} | ${loc}`);
        }
        if (jobs.length > 25) {
            console.log(`  ... and ${jobs.length - 25} more`);
        }
    }

    console.log('\n' + '='.repeat(120));
    console.log(`\nSummary: ${invalidJobs.length} / ${allJobs.length} published jobs appear non-PMHNP`);

    await prisma.$disconnect();
    await pool.end();
}

findInvalidJobs().catch((e) => {
    console.error(e);
    process.exit(1);
});
