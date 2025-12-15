/**
 * Backfill script to add parsed location data to existing jobs
 */

import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local if it exists (takes precedence)
config({ path: resolve(process.cwd(), '.env.local') });

import { prisma } from '../lib/prisma';
import { parseLocation } from '../lib/location-parser';

async function backfillLocations() {
  console.log('Starting location parsing backfill...\n');
  
  // Debug: Check if DATABASE_URL is loaded
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set!');
    process.exit(1);
  }
  console.log('✓ DATABASE_URL is loaded\n');
  
  try {
    // Get all jobs that need location parsing
    // Update all jobs for now (will skip those already parsed)
    const jobs = await prisma.job.findMany({
      where: {
        city: null,
        state: null,
      },
      select: {
        id: true,
        location: true,
      },
    });

    console.log(`Found ${jobs.length} jobs to parse\n`);

    if (jobs.length === 0) {
      console.log('✅ No jobs need location parsing. All done!');
      return;
    }

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const job of jobs) {
      try {
        const parsed = parseLocation(job.location);
        
        // Update the job with parsed location data
        await prisma.job.update({
          where: { id: job.id },
          data: {
            city: parsed.city,
            state: parsed.state,
            stateCode: parsed.stateCode,
            country: parsed.country,
            isRemote: parsed.isRemote,
            isHybrid: parsed.isHybrid,
          },
        });

        updated++;
        
        // Log progress every 10 jobs
        if (updated % 10 === 0) {
          console.log(`Progress: ${updated}/${jobs.length} jobs updated`);
        }

      } catch (error) {
        console.error(`Error updating job ${job.id}:`, error);
        errors++;
        skipped++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('BACKFILL COMPLETE');
    console.log('='.repeat(60));
    console.log(`✅ Successfully updated: ${updated}`);
    console.log(`⚠️  Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('Fatal error during backfill:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
backfillLocations()
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

