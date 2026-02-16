/**
 * Dead Link Checker
 * 
 * Scans published jobs and unpublishes those with dead apply links.
 * Run periodically (daily/weekly) as: npx tsx scripts/check-dead-links.ts
 * 
 * Options:
 *   --dry-run    Show what would be unpublished without making changes (default)
 *   --fix        Actually unpublish dead-link jobs
 *   --limit N    Only check N jobs (for testing)
 */

import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { checkUrlLiveness } from '../lib/utils/resolve-url';

interface DeadJob {
    id: string;
    title: string;
    employer: string;
    applyLink: string;
    sourceProvider: string | null;
    status: number;
    originalPostedAt: Date | null;
}

async function checkDeadLinks() {
    const args = process.argv.slice(2);
    const dryRun = !args.includes('--fix');
    const limitArg = args.indexOf('--limit');
    const limit = limitArg >= 0 ? parseInt(args[limitArg + 1]) : undefined;

    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔗 DEAD LINK CHECKER ${dryRun ? '(DRY RUN)' : '⚠️  LIVE MODE'}`);
    console.log(`${'='.repeat(70)}\n`);

    // Fetch published jobs with apply links (skip employer-posted jobs)
    const jobs = await prisma.job.findMany({
        where: {
            isPublished: true,
            sourceProvider: { not: null },
            applyLink: { not: '' },
        },
        select: {
            id: true,
            title: true,
            employer: true,
            applyLink: true,
            sourceProvider: true,
            originalPostedAt: true,
        },
        orderBy: { originalPostedAt: 'asc' }, // Check oldest first
        take: limit,
    });

    console.log(`📊 Total jobs to check: ${jobs.length}\n`);

    const deadJobs: DeadJob[] = [];
    const unreachable: DeadJob[] = [];
    let checked = 0;

    // Check in batches of 5 (parallel but not too aggressive)
    const BATCH_SIZE = 5;

    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
        const batch = jobs.slice(i, i + BATCH_SIZE);

        const results = await Promise.allSettled(
            batch.map(async (job) => {
                const result = await checkUrlLiveness(job.applyLink);
                return { job, result };
            })
        );

        for (const settledResult of results) {
            if (settledResult.status === 'rejected') continue;

            const { job, result } = settledResult.value;

            if (result.isDead) {
                deadJobs.push({
                    ...job,
                    status: result.status,
                });
            } else if (result.status === 0) {
                unreachable.push({
                    ...job,
                    status: 0,
                });
            }
        }

        checked += batch.length;

        // Progress every 50 jobs
        if (checked % 50 === 0 || checked === jobs.length) {
            process.stdout.write(`\r  Checked: ${checked}/${jobs.length} | Dead: ${deadJobs.length} | Unreachable: ${unreachable.length}`);
        }
    }

    console.log('\n');

    // Summary
    console.log(`${'='.repeat(70)}`);
    console.log(`📊 RESULTS`);
    console.log(`${'='.repeat(70)}`);
    console.log(`  Checked:      ${checked}`);
    console.log(`  Dead (4xx):   ${deadJobs.length}`);
    console.log(`  Unreachable:  ${unreachable.length}`);
    console.log(`  Healthy:      ${checked - deadJobs.length - unreachable.length}\n`);

    if (deadJobs.length > 0) {
        // Group by source
        const bySource: Record<string, number> = {};
        deadJobs.forEach(j => {
            const src = j.sourceProvider || 'unknown';
            bySource[src] = (bySource[src] || 0) + 1;
        });

        console.log(`\n📦 Dead jobs by source:`);
        for (const [src, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
            console.log(`  ${src}: ${count}`);
        }

        // Show samples
        const sampleSize = Math.min(20, deadJobs.length);
        console.log(`\n📋 Sample dead jobs (${sampleSize} of ${deadJobs.length}):`);
        for (const job of deadJobs.slice(0, sampleSize)) {
            console.log(`  [${job.status}] "${job.title}" by ${job.employer}`);
            console.log(`       ${job.applyLink}`);
        }

        // Unpublish if not dry run
        if (!dryRun) {
            console.log(`\n⚠️  Unpublishing ${deadJobs.length} dead-link jobs...`);
            const ids = deadJobs.map(j => j.id);

            const chunkSize = 500;
            for (let i = 0; i < ids.length; i += chunkSize) {
                const chunk = ids.slice(i, i + chunkSize);
                await prisma.job.updateMany({
                    where: { id: { in: chunk } },
                    data: { isPublished: false },
                });
            }
            console.log(`✅ Unpublished ${deadJobs.length} jobs.`);
        } else {
            console.log(`\n💡 Run with --fix to unpublish these ${deadJobs.length} dead-link jobs.`);
        }
    }

    if (unreachable.length > 0) {
        console.log(`\n⚠️  ${unreachable.length} jobs had unreachable links (timeout/network error).`);
        console.log(`   These were NOT unpublished — they may be temporarily down.`);
        console.log(`   If they remain unreachable after 2+ runs, consider investigating.\n`);
    }

    console.log('✨ Done!\n');
    await prisma.$disconnect();
}

checkDeadLinks().catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
