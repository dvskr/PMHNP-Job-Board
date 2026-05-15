/**
 * Audit /jobs/senior filter (read-only).
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import { buildCategoryWhereClause } from '@/lib/filters';

async function main(): Promise<void> {
    const SR = buildCategoryWhereClause('senior');
    const NG = buildCategoryWhereClause('new-grad');
    const EL = buildCategoryWhereClause('entry-level');

    const total = await prisma.job.count({ where: SR });
    const overlapNG = await prisma.job.count({ where: { AND: [SR, NG] } });
    const overlapEL = await prisma.job.count({ where: { AND: [SR, EL] } });

    // Senior should be 7+ years OR have "senior/director/lead/chief" in title.
    // False positives: newGradFriendly=true OR minYearsExperience <= 1.
    const tooJunior = await prisma.job.count({
        where: {
            AND: [
                SR,
                {
                    OR: [
                        { newGradFriendly: true },
                        { minYearsExperience: { lte: 1 } },
                    ],
                },
            ],
        },
    });

    // Also count "only matches via salary band" — i.e., jobs that match
    // SR purely because normalizedMinSalary >= 130k, with NO leadership
    // title cue. These are the soft false positives the filter accepts.
    const matchesOnlyBySalary = await prisma.job.count({
        where: {
            AND: [
                SR,
                {
                    NOT: {
                        OR: [
                            { title: { contains: 'senior', mode: 'insensitive' } },
                            { title: { contains: 'lead', mode: 'insensitive' } },
                            { title: { contains: 'director', mode: 'insensitive' } },
                            { title: { contains: 'supervisor', mode: 'insensitive' } },
                            { title: { contains: 'chief', mode: 'insensitive' } },
                            { title: { contains: 'experienced', mode: 'insensitive' } },
                            { title: { contains: 'VP ', mode: 'insensitive' } },
                            { title: { contains: 'vice president', mode: 'insensitive' } },
                        ],
                    },
                },
            ],
        },
    });

    const worst = await prisma.job.findMany({
        where: {
            AND: [
                SR,
                {
                    OR: [
                        { newGradFriendly: true },
                        { minYearsExperience: { lte: 1 } },
                        { title: { contains: 'new grad', mode: 'insensitive' } },
                        { title: { contains: 'entry', mode: 'insensitive' } },
                    ],
                },
            ],
        },
        select: { title: true, minYearsExperience: true, newGradFriendly: true, normalizedMinSalary: true },
        take: 10,
    });

    const sample = await prisma.job.findMany({
        where: SR,
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
    console.log('AUDIT: /jobs/senior');
    console.log('═'.repeat(78));
    console.log(`Total senior jobs:                  ${total}`);
    console.log(`Overlap with new-grad:              ${overlapNG}  (${total > 0 ? Math.round((overlapNG / total) * 100) : 0}%)`);
    console.log(`Overlap with entry-level:           ${overlapEL}  (${total > 0 ? Math.round((overlapEL / total) * 100) : 0}%)`);
    console.log(`False positives (minY<=1 OR newGrad): ${tooJunior}`);
    console.log(`Match ONLY via salary band (no senior/lead/director/etc. in title): ${matchesOnlyBySalary}  (${total > 0 ? Math.round((matchesOnlyBySalary / total) * 100) : 0}%)`);
    console.log();
    console.log('Worst-offender titles (new-grad-ish jobs still in senior):');
    for (const j of worst) {
        console.log(`  - ${j.title} | minY=${j.minYearsExperience ?? 'null'} | newGrad=${j.newGradFriendly} | minSalary=${j.normalizedMinSalary ?? 'null'}`);
    }
    console.log();
    console.log('Sample (15 most-recent senior jobs):');
    console.log('  title | minY | maxY | newGrad | expLevel');
    for (const j of sample) {
        console.log(`  - ${j.title.slice(0, 55)} | ${j.minYearsExperience ?? 'null'} | ${j.maxYearsExperience ?? 'null'} | ${j.newGradFriendly} | ${j.experienceLevel ?? 'null'}`);
    }

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
