import dotenv from 'dotenv';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { cleanDescription } from '../lib/description-cleaner';

dotenv.config();

// Custom Prisma client setup
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not defined');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function cleanJobDescriptions() {
  try {
    console.log('🧹 Cleaning Job Descriptions\n');
    console.log('='.repeat(60));

    // Fetch all jobs with descriptions
    const jobs = await prisma.job.findMany({
      where: {
        isPublished: true,
        description: {
          not: '',
        },
      },
      select: {
        id: true,
        title: true,
        description: true,
        descriptionSummary: true,
      },
    });

    console.log(`\n📊 Found ${jobs.length} jobs to process\n`);

    let updated = 0;
    let unchanged = 0;
    let errors = 0;

    // Sample tracking
    const samples: Array<{
      title: string;
      before: string;
      after: string;
    }> = [];

    for (const job of jobs) {
      try {
        if (!job.description) {
          unchanged++;
          continue;
        }

        const cleanedDescription = cleanDescription(job.description);
        const cleanedSummary = cleanedDescription.slice(0, 300) + (cleanedDescription.length > 300 ? '...' : '');

        // Only update if changed
        if (cleanedDescription !== job.description) {
          await prisma.job.update({
            where: { id: job.id },
            data: {
              description: cleanedDescription,
              descriptionSummary: cleanedSummary,
            },
          });

          updated++;

          // Save first 3 samples
          if (samples.length < 3) {
            samples.push({
              title: job.title,
              before: job.description.slice(0, 150),
              after: cleanedDescription.slice(0, 150),
            });
          }
        } else {
          unchanged++;
        }
      } catch (error) {
        console.error(`Error processing job ${job.id}:`, error);
        errors++;
      }
    }

    console.log('\n✅ Cleaning Complete\n');
    console.log('📈 STATISTICS:');
    console.log(`   Total jobs: ${jobs.length}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Unchanged: ${unchanged}`);
    console.log(`   Errors: ${errors}`);

    if (samples.length > 0) {
      console.log('\n📝 SAMPLE UPDATES:\n');
      samples.forEach((sample, idx) => {
        console.log(`${idx + 1}. ${sample.title}`);
        console.log(`   BEFORE: ${sample.before}...`);
        console.log(`   AFTER:  ${sample.after}...`);
        console.log();
      });
    }

    await pool.end();
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error cleaning descriptions:', error);
    await pool.end();
    await prisma.$disconnect();
    process.exit(1);
  }
}

cleanJobDescriptions();

