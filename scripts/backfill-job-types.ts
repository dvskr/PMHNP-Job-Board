import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { detectJobType } from '../lib/job-normalizer';


async function backfillJobTypes() {
    console.log('🔄 SCRIPT: Backfilling Job Types');

    try {
        // 1. Count jobs with missing jobType
        const count = await prisma.job.count({
            where: {
                jobType: null
            }
        });

        console.log(`Found ${count} jobs with missing job_type.`);

        if (count === 0) {
            console.log('✅ No jobs to backfill.');
            return;
        }

        // 2. Fetch all jobs with missing jobType (process in batches)
        const batchSize = 500;
        let processed = 0;
        let updated = 0;

        for (let i = 0; i < count; i += batchSize) {
            const jobs = await prisma.job.findMany({
                where: { jobType: null },
                take: batchSize,
                select: { id: true, title: true, description: true }
            });

            for (const job of jobs) {
                // Concatenate title and description for better detection
                const fullText = `${job.title} ${job.description}`;
                const detectedType = detectJobType(fullText);

                if (detectedType) {
                    await prisma.job.update({
                        where: { id: job.id },
                        data: { jobType: detectedType }
                    });
                    updated++;
                }
                processed++;
            }

            console.log(`Progress: ${Math.min(processed, count)}/${count} processed. Updated: ${updated}`);
        }

        console.log('\n' + '='.repeat(40));
        console.log(`✅ COMPLETE`);
        console.log(`Processed: ${processed}`);
        console.log(`Updated: ${updated}`);
        console.log('='.repeat(40) + '\n');

    } catch (error) {
        console.error('❌ Error backfilling job types:', error);
    } finally {
        await prisma.$disconnect();
    }
}

backfillJobTypes();
