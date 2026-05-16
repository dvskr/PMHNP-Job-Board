/**
 * Audit /jobs/entry-level filter (read-only).
 *
 * Verifies:
 *   - DB count
 *   - 15-sample (title, minYears, maxYears, newGradFriendly, experienceLevel)
 *   - Overlap with /jobs/new-grad page (jobs that match BOTH filters)
 *   - Sample false-positive count (jobs where minYearsExperience >= 2)
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import { buildCategoryWhereClause } from '@/lib/filters';

async function main(): Promise<void> {
    const EL = buildCategoryWhereClause('entry-level');
    const NG = buildCategoryWhereClause('new-grad');

    const total = await prisma.job.count({ where: EL });
    const ngTotal = await prisma.job.count({ where: NG });
    const overlap = await prisma.job.count({
        where: { AND: [EL, NG] },
    });

    // False positive heuristic: a job is in entry-level filter but
    // requires 2+ years of experience.
    const falsePositives = await prisma.job.count({
        where: {
            AND: [EL, { minYearsExperience: { gte: 2 } }],
        },
    });

    // Worst offenders: senior/director titles that still match entry-level.
    const worst = await prisma.job.findMany({
        where: {
            AND: [
                EL,
                {
                    OR: [
                        { minYearsExperience: { gte: 3 } },
                        { title: { contains: 'senior', mode: 'insensitive' } },
                        { title: { contains: 'director', mode: 'insensitive' } },
                        { title: { contains: 'lead', mode: 'insensitive' } },
                    ],
                },
            ],
        },
        select: { title: true, minYearsExperience: true, newGradFriendly: true },
        take: 10,
    });

    const sample = await prisma.job.findMany({
        where: EL,
        select: {
            title: true,
            minYearsExperience: true,
            maxYearsExperience: true,
            newGradFriendly: true,
            experienceLevel: true,
        },
        take: 15,
        orderBy: [{ originalPostedAt: 'desc' }],
    });

    console.log('═'.repeat(78));
    console.log('AUDIT: /jobs/entry-level');
    console.log('═'.repeat(78));
    console.log(`Total entry-level jobs:        ${total}`);
    console.log(`Total new-grad jobs:           ${ngTotal}`);
    console.log(`Overlap (both filters match):  ${overlap}  (${total > 0 ? Math.round((overlap / total) * 100) : 0}% of entry-level)`);
    console.log(`False positives (minYears>=2): ${falsePositives}`);
    console.log();
    console.log('Worst-offender titles (senior/director/lead OR minYears>=3 still in EL):');
    for (const j of worst) {
        console.log(`  - ${j.title} | minY=${j.minYearsExperience ?? 'null'} | newGrad=${j.newGradFriendly}`);
    }
    console.log();
    console.log('Sample (15 most-recent entry-level jobs):');
    console.log('  title | minY | maxY | newGrad | expLevel');
    for (const j of sample) {
        console.log(`  - ${j.title.slice(0, 55)} | ${j.minYearsExperience ?? 'null'} | ${j.maxYearsExperience ?? 'null'} | ${j.newGradFriendly} | ${j.experienceLevel ?? 'null'}`);
    }

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
