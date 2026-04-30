/**
 * Fix stale salary_period values that don't match the magnitude of the
 * stored min/max amounts.
 *
 * Pattern: an earlier ingest stored min=20, max=28, period='hour'. The
 * normalizer correctly produced normalizedMin=41600, normalizedMax=58240.
 * Then a later one-shot script overwrote minSalary/maxSalary with the
 * annualized values (41600, 58240) but did not update salaryPeriod, which
 * still says 'hour'. Today's audit interprets this as "$41,600/HOUR" which
 * is nonsense.
 *
 * Cleanup rule:
 *   if salaryPeriod IN ('hour','hourly') AND minSalary >= 1000
 *     → minSalary is clearly already annualized; set salaryPeriod = 'year'
 *   if salaryPeriod IN ('week','weekly') AND minSalary >= 20000
 *     → set salaryPeriod = 'year'
 *   if salaryPeriod IN ('month','monthly') AND minSalary >= 50000
 *     → set salaryPeriod = 'year'
 *
 * Read-only by default; --apply to commit.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';

const APPLY = process.argv.includes('--apply');

interface Rule {
    label: string;
    period: string[];
    minSalaryGte: number;
}

const RULES: Rule[] = [
    { label: 'hourly>=$1000', period: ['hour', 'hourly'], minSalaryGte: 1000 },
    { label: 'weekly>=$20k', period: ['week', 'weekly'], minSalaryGte: 20_000 },
    { label: 'monthly>=$50k', period: ['month', 'monthly'], minSalaryGte: 50_000 },
];

async function main(): Promise<void> {
    console.log(APPLY ? '🟢 APPLY MODE — will write to prod' : '🔍 DRY-RUN — no writes');
    console.log();

    let totalFixed = 0;
    for (const r of RULES) {
        const candidates = await prisma.job.findMany({
            where: {
                salaryPeriod: { in: r.period },
                minSalary: { gte: r.minSalaryGte },
            },
            select: { id: true, minSalary: true, maxSalary: true, salaryPeriod: true, normalizedMinSalary: true },
        });
        console.log(`Rule "${r.label}": ${candidates.length} jobs to fix`);
        if (candidates.length > 0 && candidates[0]) {
            const sample = candidates[0];
            console.log(`  e.g. min=${sample.minSalary}, max=${sample.maxSalary}, period="${sample.salaryPeriod}", normalized=${sample.normalizedMinSalary}`);
        }
        if (APPLY && candidates.length > 0) {
            const r2 = await prisma.job.updateMany({
                where: { id: { in: candidates.map((c) => c.id) } },
                data: { salaryPeriod: 'year' },
            });
            console.log(`  ✓ updated ${r2.count}`);
            totalFixed += r2.count;
        } else if (!APPLY) {
            totalFixed += candidates.length;
        }
    }

    console.log();
    console.log(`Total ${APPLY ? 'fixed' : 'would fix'}: ${totalFixed}`);
    if (!APPLY && totalFixed > 0) console.log('Re-run with --apply to commit.');

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Fix failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
