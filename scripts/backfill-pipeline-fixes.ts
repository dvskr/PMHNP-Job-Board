/**
 * Backfill script: Apply pipeline audit fixes to existing jobs
 *
 * 1. Re-run isRelevantJob filter → unpublish irrelevant jobs
 * 2. Re-clean descriptions with HTML artifacts
 * 3. Audit stats
 *
 * Usage: npx tsx scripts/backfill-pipeline-fixes.ts [--dry-run]
 */

import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { isRelevantJob } from '../lib/utils/job-filter';
import { cleanDescription } from '../lib/description-cleaner';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  BACKFILL PIPELINE FIXES ${DRY_RUN ? '(DRY RUN — no changes will be saved)' : '(LIVE RUN)'}`);
    console.log(`${'='.repeat(70)}\n`);

    // ─── Step 1: Re-run relevance filter on all published jobs ───
    console.log('─── Step 1: Relevance Filter Audit ───');

    const publishedJobs = await prisma.job.findMany({
        where: { isPublished: true },
        select: {
            id: true,
            title: true,
            description: true,
            employer: true,
            sourceProvider: true,
        },
    });

    console.log(`  Total published jobs: ${publishedJobs.length}`);

    const irrelevantJobs: Array<{ id: string; title: string; employer: string; source: string | null }> = [];

    for (const job of publishedJobs) {
        if (!isRelevantJob(job.title, job.description || '')) {
            irrelevantJobs.push({
                id: job.id,
                title: job.title,
                employer: job.employer,
                source: job.sourceProvider,
            });
        }
    }

    console.log(`  Irrelevant jobs found: ${irrelevantJobs.length}`);

    if (irrelevantJobs.length > 0) {
        console.log('\n  Jobs that will be UNPUBLISHED:');
        for (const job of irrelevantJobs.slice(0, 30)) {
            console.log(`    ❌ [${job.source || 'unknown'}] "${job.title}" — ${job.employer}`);
        }
        if (irrelevantJobs.length > 30) {
            console.log(`    ... and ${irrelevantJobs.length - 30} more`);
        }

        if (!DRY_RUN) {
            const ids = irrelevantJobs.map(j => j.id);
            const result = await prisma.job.updateMany({
                where: { id: { in: ids } },
                data: { isPublished: false },
            });
            console.log(`\n  ✅ Unpublished ${result.count} irrelevant jobs`);
        } else {
            console.log(`\n  🔍 DRY RUN: Would unpublish ${irrelevantJobs.length} jobs`);
        }
    }

    // ─── Step 2: Re-clean descriptions with HTML ───
    console.log('\n─── Step 2: Description Cleaning ───');

    const dirtyJobs = await prisma.job.findMany({
        where: {
            OR: [
                { description: { contains: '<' } },
                { descriptionSummary: { contains: '<' } },
            ],
        },
        select: {
            id: true,
            description: true,
            descriptionSummary: true,
        },
    });

    console.log(`  Jobs with HTML in descriptions: ${dirtyJobs.length}`);

    let cleaned = 0;
    let cleanErrors = 0;

    for (const job of dirtyJobs) {
        try {
            const hasHtml = /<[^>]+>/.test(job.description || '') || /<[^>]+>/.test(job.descriptionSummary || '');
            if (!hasHtml) continue;

            const cleanedDescription = cleanDescription(job.description || '');
            const cleanedSummary = cleanedDescription.slice(0, 300) + (cleanedDescription.length > 300 ? '...' : '');

            if (!DRY_RUN) {
                await prisma.job.update({
                    where: { id: job.id },
                    data: {
                        description: cleanedDescription,
                        descriptionSummary: cleanedSummary,
                    },
                });
            }
            cleaned++;
        } catch (error) {
            cleanErrors++;
        }
    }

    if (DRY_RUN) {
        console.log(`  🔍 DRY RUN: Would clean ${cleaned} job descriptions`);
    } else {
        console.log(`  ✅ Cleaned ${cleaned} descriptions, ${cleanErrors} errors`);
    }

    // ─── Step 3: Backfill missing originalPostedAt ───
    console.log('\n─── Step 3: Backfill originalPostedAt ───');

    const jobsMissingDate = await prisma.job.findMany({
        where: {
            isPublished: true,
            originalPostedAt: null,
        },
        select: {
            id: true,
            createdAt: true,
            sourceProvider: true,
        },
    });

    console.log(`  Published jobs missing originalPostedAt: ${jobsMissingDate.length}`);

    if (jobsMissingDate.length > 0) {
        // Show source breakdown of missing dates
        const missingBySource = new Map<string, number>();
        for (const j of jobsMissingDate) {
            const src = j.sourceProvider || 'unknown';
            missingBySource.set(src, (missingBySource.get(src) || 0) + 1);
        }
        console.log('  Breakdown by source:');
        for (const [src, count] of missingBySource) {
            console.log(`    ${src.padEnd(20)} ${count}`);
        }

        if (!DRY_RUN) {
            // Batch update: copy createdAt → originalPostedAt
            let updated = 0;
            for (const job of jobsMissingDate) {
                await prisma.job.update({
                    where: { id: job.id },
                    data: { originalPostedAt: job.createdAt },
                });
                updated++;
            }
            console.log(`\n  ✅ Backfilled originalPostedAt for ${updated} jobs (using createdAt)`);
        } else {
            console.log(`\n  🔍 DRY RUN: Would backfill ${jobsMissingDate.length} jobs with their createdAt date`);
        }
    }

    // ─── Step 4: Audit Stats ───
    console.log('\n─── Step 4: Database Audit ───');

    const [totalJobs, publishedCount, unpublishedCount, noDescription, noApplyLink, expiredPublished] = await Promise.all([
        prisma.job.count(),
        prisma.job.count({ where: { isPublished: true } }),
        prisma.job.count({ where: { isPublished: false } }),
        prisma.job.count({ where: { isPublished: true, description: '' } }),
        prisma.job.count({ where: { isPublished: true, applyLink: '' } }),
        prisma.job.count({ where: { isPublished: true, expiresAt: { lt: new Date() } } }),
    ]);

    const withOriginalDate = await prisma.job.count({
        where: { isPublished: true, originalPostedAt: { not: null } },
    });

    const withoutOriginalDate = await prisma.job.count({
        where: { isPublished: true, originalPostedAt: null },
    });

    console.log(`  Total jobs:            ${totalJobs}`);
    console.log(`  Published:             ${publishedCount}`);
    console.log(`  Unpublished:           ${unpublishedCount}`);
    console.log(`  Has originalPostedAt:  ${withOriginalDate}`);
    console.log(`  Missing originalDate:  ${withoutOriginalDate}`);
    console.log(`  Empty description:     ${noDescription}`);
    console.log(`  Empty applyLink:       ${noApplyLink}`);
    console.log(`  Expired but published: ${expiredPublished}`);

    // Source breakdown
    const sourceBreakdown = await prisma.job.groupBy({
        by: ['sourceProvider'],
        where: { isPublished: true },
        _count: true,
        orderBy: { _count: { sourceProvider: 'desc' } },
    });

    console.log('\n  Published jobs by source:');
    for (const row of sourceBreakdown) {
        console.log(`    ${(row.sourceProvider || 'unknown').padEnd(20)} ${row._count}`);
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`  BACKFILL COMPLETE${DRY_RUN ? ' (DRY RUN)' : ''}`);
    console.log(`${'='.repeat(70)}\n`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
