/**
 * Audit /jobs/mid-career filter (read-only).
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import { buildCategoryWhereClause } from '@/lib/filters';

async function main(): Promise<void> {
    const MC = buildCategoryWhereClause('mid-career');
    const NG = buildCategoryWhereClause('new-grad');
    const SR = buildCategoryWhereClause('senior');

    const total = await prisma.job.count({ where: MC });
    const overlapNG = await prisma.job.count({ where: { AND: [MC, NG] } });
    const overlapSR = await prisma.job.count({ where: { AND: [MC, SR] } });

    // False positive heuristic: mid-career should be 2-7 years.
    // Anything with minYears 0-1 OR newGradFriendly is a false positive,
    // and anything with minYears >= 8 should ideally be senior.
    const tooJunior = await prisma.job.count({
        where: { AND: [MC, { OR: [{ minYearsExperience: { lte: 1 } }, { newGradFriendly: true }] }] },
    });

    const worst = await prisma.job.findMany({
        where: {
            AND: [
                MC,
                {
                    OR: [
                        { newGradFriendly: true },
                        { minYearsExperience: 0 },
                        { title: { contains: 'new grad', mode: 'insensitive' } },
                        { title: { contains: 'entry', mode: 'insensitive' } },
                    ],
                },
            ],
        },
        select: { title: true, minYearsExperience: true, newGradFriendly: true },
        take: 10,
    });

    const sample = await prisma.job.findMany({
        where: MC,
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
    console.log('AUDIT: /jobs/mid-career');
    console.log('═'.repeat(78));
    console.log(`Total mid-career jobs:         ${total}`);
    console.log(`Overlap with new-grad:         ${overlapNG}  (${total > 0 ? Math.round((overlapNG / total) * 100) : 0}%)`);
    console.log(`Overlap with senior:           ${overlapSR}  (${total > 0 ? Math.round((overlapSR / total) * 100) : 0}%)`);
    console.log(`False positives (minY<=1 OR newGrad=true): ${tooJunior}`);
    console.log();
    console.log('Worst-offender titles (new-grad-ish jobs still in mid-career):');
    for (const j of worst) {
        console.log(`  - ${j.title} | minY=${j.minYearsExperience ?? 'null'} | newGrad=${j.newGradFriendly}`);
    }
    console.log();
    console.log('Sample (15 most-recent mid-career jobs):');
    console.log('  title | minY | maxY | newGrad | expLevel');
    for (const j of sample) {
        console.log(`  - ${j.title.slice(0, 55)} | ${j.minYearsExperience ?? 'null'} | ${j.maxYearsExperience ?? 'null'} | ${j.newGradFriendly} | ${j.experienceLevel ?? 'null'}`);
    }

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
