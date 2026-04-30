/**
 * Audit normalized salary outliers in published jobs.
 * PMHNP comp realistic floor: ~$80k/yr. Anything below $50k annualized
 * is almost certainly a period-detection bug (raw hourly value rendered
 * as annual without the *2080 multiplication).
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';

async function main(): Promise<void> {
    console.log('Salary outlier audit (published jobs):\n');

    const lowOutliers = await prisma.job.findMany({
        where: {
            isPublished: true,
            normalizedMinSalary: { gt: 0, lt: 50_000 },
        },
        select: {
            id: true,
            title: true,
            employer: true,
            sourceProvider: true,
            minSalary: true,
            maxSalary: true,
            salaryPeriod: true,
            normalizedMinSalary: true,
            normalizedMaxSalary: true,
            displaySalary: true,
            salaryIsEstimated: true,
        },
        orderBy: { normalizedMinSalary: 'asc' },
        take: 30,
    });

    console.log(`Found ${lowOutliers.length} published jobs with normalizedMinSalary < $50k:\n`);
    for (const j of lowOutliers) {
        console.log(
            `  $${j.normalizedMinSalary?.toLocaleString().padStart(7)}/yr  ` +
            `(raw $${j.minSalary?.toLocaleString().padStart(6)}-$${j.maxSalary?.toLocaleString().padStart(6)} per ${j.salaryPeriod ?? '?'}, ` +
            `display="${j.displaySalary}", est=${j.salaryIsEstimated})  ` +
            `[${j.sourceProvider}] ${j.title}  @ ${j.employer}`,
        );
    }

    // Distribution by source
    console.log();
    console.log('Distribution of low-salary outliers by source:');
    const allLow = await prisma.job.findMany({
        where: {
            isPublished: true,
            normalizedMinSalary: { gt: 0, lt: 50_000 },
        },
        select: { sourceProvider: true, salaryPeriod: true },
    });
    const bySrc = new Map<string, number>();
    const byPeriod = new Map<string, number>();
    for (const j of allLow) {
        const s = j.sourceProvider ?? 'unknown';
        bySrc.set(s, (bySrc.get(s) ?? 0) + 1);
        const p = j.salaryPeriod ?? 'unknown';
        byPeriod.set(p, (byPeriod.get(p) ?? 0) + 1);
    }
    console.log('  By source:');
    for (const [k, v] of [...bySrc.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${k.padEnd(25)} ${v}`);
    }
    console.log('  By salaryPeriod:');
    for (const [k, v] of [...byPeriod.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${k.padEnd(25)} ${v}`);
    }

    // Also surface implausible HIGH outliers (> $500k for PMHNP)
    console.log();
    const highOutliers = await prisma.job.findMany({
        where: {
            isPublished: true,
            normalizedMaxSalary: { gt: 500_000 },
        },
        select: {
            id: true,
            title: true,
            sourceProvider: true,
            minSalary: true,
            maxSalary: true,
            salaryPeriod: true,
            normalizedMaxSalary: true,
            displaySalary: true,
        },
        orderBy: { normalizedMaxSalary: 'desc' },
        take: 10,
    });
    console.log(`Top high-salary outliers (>$500k normalizedMax):`);
    for (const j of highOutliers) {
        console.log(
            `  $${j.normalizedMaxSalary?.toLocaleString().padStart(7)}/yr  ` +
            `(raw $${j.minSalary?.toLocaleString()}-$${j.maxSalary?.toLocaleString()} per ${j.salaryPeriod ?? '?'}, ` +
            `display="${j.displaySalary}")  [${j.sourceProvider}] ${j.title}`,
        );
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Audit failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
