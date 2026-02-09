import 'dotenv/config';
import { fetchJSearchJobs } from '../lib/aggregators/jsearch';
import { prisma } from '../lib/prisma';
import { normalizeJob } from '../lib/job-normalizer';
import { checkDuplicate } from '../lib/deduplicator';

// Sample set: 1 Major City, 1 Mid-Sized City, 1 County
const SAMPLES = [
    'PMHNP New York, NY',
    'PMHNP Spokane, WA',
    'PMHNP Los Angeles County, CA'
];

async function runSample() {
    console.log('='.repeat(70));
    console.log('  HYPER-LOCAL STRATEGY: SAMPLE RUN');
    console.log('='.repeat(70));
    console.log(`\n🎯 Targets: ${SAMPLES.join(' | ')}`);

    try {
        // 1. Fetch raw jobs
        console.log('\n📡 Fetching from JSearch...');
        const rawJobs = await fetchJSearchJobs({
            pagesPerQuery: 2, // Shallow fetch for testing
            specificQueries: SAMPLES
        });

        console.log(`\n✅ Fetched ${rawJobs.length} raw jobs.`);

        // 2. Process and Insert
        let added = 0;
        let skipped = 0;
        let duplicates = 0;

        console.log('\n💾 Processing & Inserting...');

        for (const raw of rawJobs) {
            const normalized = normalizeJob(raw, 'jsearch');

            if (!normalized) {
                skipped++;
                continue;
            }

            const isDupe = await checkDuplicate({
                title: normalized.title,
                employer: normalized.employer,
                location: normalized.location,
                externalId: normalized.externalId ?? undefined,
                sourceProvider: normalized.sourceProvider ?? undefined,
                applyLink: normalized.applyLink,
            });

            if (isDupe.isDuplicate) {
                duplicates++;
                process.stdout.write('D'); // D for Duplicate
                continue;
            }

            await prisma.job.create({
                data: normalized as any,
            });
            added++;
            process.stdout.write('.'); // . for Added
        }

        console.log('\n\n📊 SAMPLE RESULTS:');
        console.log(`   Added:      ${added}`);
        console.log(`   Duplicates: ${duplicates} (Good! Means overlapping coverage works)`);
        console.log(`   Skipped:    ${skipped}`);

    } catch (error) {
        console.error('\n❌ Error during sample run:', error);
    } finally {
        await prisma.$disconnect();
    }
}

runSample();
