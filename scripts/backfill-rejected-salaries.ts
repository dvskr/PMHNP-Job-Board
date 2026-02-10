/**
 * Backfill salaries that were previously rejected due to the $300k cap.
 * Uses the updated salary-normalizer with the raised $400k cap.
 */
import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { normalizeSalary } from '../lib/salary-normalizer';

async function backfillRejectedSalaries() {
    console.log('🔄 BACKFILLING PREVIOUSLY REJECTED SALARIES');
    console.log('=============================================\n');

    // Find published jobs that have raw salary data but no normalized salary
    const jobs = await prisma.job.findMany({
        where: {
            isPublished: true,
            OR: [
                { minSalary: { not: null } },
                { maxSalary: { not: null } },
            ],
            normalizedMinSalary: null,
            normalizedMaxSalary: null,
        },
        select: {
            id: true,
            title: true,
            employer: true,
            minSalary: true,
            maxSalary: true,
            salaryPeriod: true,
            salaryRange: true,
        },
    });

    console.log('Jobs with raw salary but NO normalized salary: ' + jobs.length + '\n');

    if (jobs.length === 0) {
        console.log('Nothing to backfill!');
        return;
    }

    // Show samples first
    console.log('Sample jobs to fix:');
    for (const j of jobs.slice(0, 15)) {
        console.log('  $' + j.minSalary + '-$' + j.maxSalary + ' (' + (j.salaryPeriod || 'unknown') + ') | ' + j.title + ' | ' + j.employer);
    }
    console.log('');

    let fixed = 0;
    let stillRejected = 0;
    let errors = 0;

    for (const job of jobs) {
        try {
            const result = normalizeSalary({
                salaryRange: job.salaryRange,
                minSalary: job.minSalary,
                maxSalary: job.maxSalary,
                salaryPeriod: job.salaryPeriod,
                title: job.title,
            });

            if (result.normalizedMinSalary || result.normalizedMaxSalary) {
                await prisma.job.update({
                    where: { id: job.id },
                    data: {
                        normalizedMinSalary: result.normalizedMinSalary,
                        normalizedMaxSalary: result.normalizedMaxSalary,
                        salaryIsEstimated: result.salaryIsEstimated,
                        salaryConfidence: result.salaryConfidence,
                    },
                });
                fixed++;
                if (fixed <= 10) {
                    console.log('  ✅ Fixed: $' + result.normalizedMinSalary + '-$' + result.normalizedMaxSalary + '/yr | ' + job.title);
                }
            } else {
                stillRejected++;
                if (stillRejected <= 5) {
                    console.log('  ❌ Still rejected: $' + job.minSalary + '-$' + job.maxSalary + ' (' + (job.salaryPeriod || '?') + ') | ' + job.title);
                }
            }
        } catch (err) {
            errors++;
            if (errors <= 3) {
                console.error('  Error on job ' + job.id + ':', err);
            }
        }
    }

    console.log('\n=============================================');
    console.log('  BACKFILL COMPLETE');
    console.log('=============================================');
    console.log('  Fixed:          ' + fixed);
    console.log('  Still rejected: ' + stillRejected);
    console.log('  Errors:         ' + errors);
    console.log('=============================================');
}

backfillRejectedSalaries()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
