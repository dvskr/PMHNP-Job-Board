
import 'dotenv/config';
import { prisma } from '../lib/prisma';

const SOURCES = ['adzuna', 'usajobs', 'greenhouse', 'lever', 'jooble', 'jsearch'];

const KEYWORDS = [
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

async function inspectAllSources() {
    console.log('🔍 Starting Job Source Validation...\n');
    console.log('Criteria: Title OR Description must contain at least one PMHNP keyword.');
    console.log('----------------------------------------------------------------\n');

    const results = [];

    for (const source of SOURCES) {
        console.log(`Checking ${source}...`);

        try {
            const totalJobs = await prisma.job.count({
                where: {
                    sourceProvider: source,
                    isPublished: true,
                },
            });

            if (totalJobs === 0) {
                console.log(`(No jobs found)`);
                results.push({ source, total: 0, invalid: 0, rate: 'N/A' });
                continue;
            }

            console.log(`  Found ${totalJobs} jobs. Fetching details...`);

            // Fetch all jobs to check contents
            const jobs = await prisma.job.findMany({
                where: {
                    sourceProvider: source,
                    isPublished: true,
                },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    employer: true,
                },
            });
            console.log(`  Fetched ${jobs.length} jobs. Filtering...`);

            const invalidJobs = (jobs as any[]).filter(job => {
                const text = `${job.title || ''} ${job.description || ''}`.toLowerCase();
                return !KEYWORDS.some(kw => text.includes(kw));
            });
            console.log(`  Filtered. Found ${invalidJobs.length} invalid.`);

            const invalidCount = invalidJobs.length;
            const invalidRate = ((invalidCount / totalJobs) * 100).toFixed(1);

            console.log(`Done. ${invalidCount}/${totalJobs} Invalid (${invalidRate}%)`);

            results.push({
                source,
                total: totalJobs,
                invalid: invalidCount,
                rate: `${invalidRate}%`,
                samples: invalidJobs.slice(0, 3) // Keep 3 samples
            });
        } catch (err: any) {
            console.log('Error!');
            console.error(`Error checking ${source}:`, err.message);
        }
    }

    console.log('\n================ SUMMARY ================');
    console.table(results.map(r => ({
        Source: r.source,
        Total: r.total,
        Invalid: r.invalid,
        'Invalid %': r.rate
    })));

    console.log('\n================ SAMPLES OF INVALID JOBS (Up to 3 per source) ================');

    results.filter(r => r.invalid > 0).forEach(r => {
        if (r.samples && r.samples.length > 0) {
            console.log(`\n--- ${r.source.toUpperCase()} (${r.rate} Invalid) ---`);
            r.samples.forEach((job: any, i: number) => {
                const desc = job.description || '';
                const snippet = desc.replace(/\s+/g, ' ').substring(0, 100);
                console.log(`${i + 1}. [${job.title}] @ ${job.employer}`);
                console.log(`   Snippet: "${snippet}..."`);
            });
        }
    });

    await prisma.$disconnect();
}

inspectAllSources().catch(e => {
    console.error(e);
    process.exit(1);
});
