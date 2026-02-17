/**
 * Backfill quality scores for all existing published jobs.
 * Uses the project's Prisma client setup (with pg adapter).
 * 
 * Usage: npx tsx scripts/backfill-quality-scores.ts
 */

// Load env BEFORE any other imports (dynamic imports below)
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env' });

async function backfill() {
    // Dynamic imports so dotenv runs first
    const { prisma } = await import('../lib/prisma');
    const { computeQualityScore } = await import('../lib/utils/quality-score');

    // Fetch all published jobs with relevant fields
    const jobs = await prisma.job.findMany({
        where: { isPublished: true },
        select: {
            id: true,
            applyLink: true,
            displaySalary: true,
            normalizedMinSalary: true,
            normalizedMaxSalary: true,
            descriptionSummary: true,
            description: true,
            city: true,
            state: true,
            qualityScore: true,
            employerJobs: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
    });

    console.log(`Found ${jobs.length} published jobs to score`);

    let updated = 0;
    let skipped = 0;
    const distribution: Record<number, number> = {};

    for (const job of jobs) {
        const isEmployerPosted = job.employerJobs !== null && job.employerJobs !== undefined;
        const score = computeQualityScore({
            applyLink: job.applyLink,
            displaySalary: job.displaySalary,
            normalizedMinSalary: job.normalizedMinSalary,
            normalizedMaxSalary: job.normalizedMaxSalary,
            descriptionSummary: job.descriptionSummary,
            description: job.description,
            city: job.city,
            state: job.state,
            isEmployerPosted,
        });

        // Track distribution
        const bucket = Math.floor(score / 10) * 10;
        distribution[bucket] = (distribution[bucket] || 0) + 1;

        // Only update if score changed
        if (score !== job.qualityScore) {
            await prisma.job.update({
                where: { id: job.id },
                data: { qualityScore: score },
            });
            updated++;
        } else {
            skipped++;
        }

        if ((updated + skipped) % 500 === 0) {
            console.log(`  Progress: ${updated + skipped}/${jobs.length} (${updated} updated, ${skipped} unchanged)`);
        }
    }

    console.log(`\nBackfill complete:`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Unchanged: ${skipped}`);
    console.log(`  Total: ${jobs.length}`);
    console.log(`\nScore distribution:`);
    for (const [bucket, count] of Object.entries(distribution).sort((a, b) => Number(a[0]) - Number(b[0]))) {
        const bar = '█'.repeat(Math.ceil(count / 20));
        console.log(`  ${bucket.padStart(2)}-${(Number(bucket) + 9).toString().padStart(2)}: ${count.toString().padStart(5)} ${bar}`);
    }
}

backfill().catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
});
