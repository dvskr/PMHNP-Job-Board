/**
 * Backfill script to add normalized salary data to existing jobs
 */

import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local if it exists (takes precedence)
config({ path: resolve(process.cwd(), '.env.local') });

import { prisma } from '../lib/prisma';
import { normalizeSalary } from '../lib/salary-normalizer';

async function backfillNormalizedSalaries() {
  console.log('Starting salary normalization backfill...\n');
  
  // Debug: Check if DATABASE_URL is loaded
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set!');
    process.exit(1);
  }
  console.log('✓ DATABASE_URL is loaded\n');
  
  try {
    // Get all jobs that have salary data but no normalized salary
    const jobs = await prisma.job.findMany({
      where: {
        OR: [
          { minSalary: { not: null } },
          { maxSalary: { not: null } },
        ],
        AND: [
          { normalizedMinSalary: null },
          { normalizedMaxSalary: null },
        ],
      },
      select: {
        id: true,
        title: true,
        salaryRange: true,
        minSalary: true,
        maxSalary: true,
        salaryPeriod: true,
      },
    });

    console.log(`Found ${jobs.length} jobs to normalize\n`);

    if (jobs.length === 0) {
      console.log('No jobs need normalization!');
      return;
    }

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const job of jobs) {
      try {
        const normalized = normalizeSalary({
          salaryRange: job.salaryRange,
          minSalary: job.minSalary,
          maxSalary: job.maxSalary,
          salaryPeriod: job.salaryPeriod,
          title: job.title,
        });

        // Only update if we got valid normalized data
        if (normalized.normalizedMinSalary || normalized.normalizedMaxSalary) {
          await prisma.job.update({
            where: { id: job.id },
            data: {
              normalizedMinSalary: normalized.normalizedMinSalary,
              normalizedMaxSalary: normalized.normalizedMaxSalary,
              salaryIsEstimated: normalized.salaryIsEstimated,
              salaryConfidence: normalized.salaryConfidence,
            },
          });
          updated++;
          
          if (updated % 50 === 0) {
            console.log(`Progress: ${updated}/${jobs.length} jobs updated`);
          }
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`Error normalizing job ${job.id}:`, error);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('Backfill Complete!');
    console.log('='.repeat(50));
    console.log(`Total jobs processed: ${jobs.length}`);
    console.log(`Successfully updated: ${updated}`);
    console.log(`Skipped (invalid data): ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('Fatal error during backfill:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the backfill
backfillNormalizedSalaries()
  .then(() => {
    console.log('\n✓ Backfill completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Backfill failed:', error);
    process.exit(1);
  });

