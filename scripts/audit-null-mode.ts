/**
 * How many published null-mode jobs are already-enriched (won't retry
 * via the regular enrich-jobs cron)?
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';

async function main(): Promise<void> {
    const nullMode = await prisma.job.count({ where: { isPublished: true, mode: null } });
    const nullModeAlreadyEnriched = await prisma.job.count({
        where: { isPublished: true, mode: null, lastEnrichedAt: { not: null } },
    });
    const nullModeNotYetEnriched = await prisma.job.count({
        where: { isPublished: true, mode: null, lastEnrichedAt: null },
    });
    const nullModeWithDescription = await prisma.job.count({
        where: {
            isPublished: true,
            mode: null,
            description: { not: '' },
        },
    });

    console.log('Published jobs with mode=null:');
    console.log(`  total                            ${nullMode}`);
    console.log(`  already-enriched (won't retry)   ${nullModeAlreadyEnriched}`);
    console.log(`  not-yet-enriched (will retry)    ${nullModeNotYetEnriched}`);
    console.log(`  has non-empty description        ${nullModeWithDescription}`);

    // Per-source breakdown so we know where to focus the backfill.
    const bySource = await prisma.job.groupBy({
        by: ['sourceProvider'],
        where: { isPublished: true, mode: null, lastEnrichedAt: { not: null } },
        _count: { _all: true },
    });
    console.log('\nAlready-enriched null-mode by source:');
    for (const s of bySource.sort((a, b) => b._count._all - a._count._all)) {
        console.log(`  ${(s.sourceProvider ?? 'unknown').padEnd(20)} ${s._count._all}`);
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Audit failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
