/**
 * Audit mode + jobType taxonomy in prod.
 * Read-only — prints distinct values + counts for both columns so we can
 * design a deterministic mapping table before writing the cleanup script.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';

async function main(): Promise<void> {
    console.log('═'.repeat(70));
    console.log('MODE distribution (all jobs, all states)');
    console.log('═'.repeat(70));
    const modes = await prisma.job.groupBy({
        by: ['mode'],
        _count: { _all: true },
    });
    for (const m of modes.sort((a, b) => b._count._all - a._count._all)) {
        console.log(`  ${(m.mode ?? '(null)').padEnd(35)} ${m._count._all}`);
    }

    console.log();
    console.log('═'.repeat(70));
    console.log('JOB_TYPE distribution (all jobs, all states)');
    console.log('═'.repeat(70));
    const types = await prisma.job.groupBy({
        by: ['jobType'],
        _count: { _all: true },
    });
    for (const t of types.sort((a, b) => b._count._all - a._count._all)) {
        console.log(`  ${(t.jobType ?? '(null)').padEnd(35)} ${t._count._all}`);
    }

    console.log();
    console.log('═'.repeat(70));
    console.log('JOB_TYPE distribution (PUBLISHED only)');
    console.log('═'.repeat(70));
    const typesPub = await prisma.job.groupBy({
        by: ['jobType'],
        where: { isPublished: true },
        _count: { _all: true },
    });
    for (const t of typesPub.sort((a, b) => b._count._all - a._count._all)) {
        console.log(`  ${(t.jobType ?? '(null)').padEnd(35)} ${t._count._all}`);
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Audit failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
