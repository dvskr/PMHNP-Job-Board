/**
 * Audit which top-of-board jobs have null experienceLabel.
 *   npx tsx scripts/check-exp-chips.ts [--env=prod]
 */
import { config as dotenvConfig } from 'dotenv';
const isProd = process.argv.includes('--env=prod');
if (isProd) {
    dotenvConfig({ path: '.env.prod' });
    if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
    if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
} else {
    dotenvConfig({ path: '.env' });
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');

async function main(): Promise<void> {
    const recent = await prisma.job.findMany({
        where: { isPublished: true, sourceType: 'employer' },
        select: { id: true, title: true, employer: true, experienceLabel: true, minYearsExperience: true, newGradFriendly: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 15,
    });
    console.log(`env=${isProd ? 'prod' : 'dev'}  most-recent employer-posted jobs:`);
    console.log('');
    for (const j of recent) {
        const label = j.experienceLabel ?? '(null)';
        console.log(`  ${(j.experienceLabel ? '✅' : '❌')}  ${label.padEnd(20)}  min=${String(j.minYearsExperience ?? '-').padStart(3)}  newGrad=${String(j.newGradFriendly).padEnd(5)}  ${j.employer.slice(0, 35).padEnd(35)}  ${j.title.slice(0, 55)}`);
    }

    const totalNull = await prisma.job.count({
        where: { isPublished: true, sourceType: 'employer', experienceLabel: null },
    });
    const total = await prisma.job.count({ where: { isPublished: true, sourceType: 'employer' } });
    console.log(`\n  ${totalNull}/${total} employer-posted jobs have NULL experienceLabel`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
