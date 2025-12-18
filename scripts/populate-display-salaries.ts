import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { formatDisplaySalary } from '../lib/salary-display';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function populateDisplaySalaries() {
  console.log('💰 Populating Display Salary Field\n');
  console.log('='.repeat(70));

  // Get all jobs with salary data but no displaySalary
  const jobsToUpdate = await prisma.job.findMany({
    where: {
      OR: [
        { normalizedMinSalary: { not: null } },
        { normalizedMaxSalary: { not: null } },
      ],
    },
    select: {
      id: true,
      normalizedMinSalary: true,
      normalizedMaxSalary: true,
      salaryPeriod: true,
      displaySalary: true,
    },
  });

  console.log(`\n📊 Found ${jobsToUpdate.length} jobs with salary data\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const job of jobsToUpdate) {
    try {
      const displaySalary = formatDisplaySalary(
        job.normalizedMinSalary,
        job.normalizedMaxSalary,
        job.salaryPeriod
      );

      // Skip if already has displaySalary and it matches what we'd generate
      if (job.displaySalary === displaySalary) {
        skipped++;
        continue;
      }

      await prisma.job.update({
        where: { id: job.id },
        data: { displaySalary },
      });

      updated++;

      if (updated % 100 === 0) {
        console.log(`  ✓ Updated ${updated} jobs...`);
      }
    } catch (error) {
      console.error(`  ✗ Error updating job ${job.id}:`, error);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`✅ Updated: ${updated}`);
  console.log(`⏭️  Skipped (already set): ${skipped}`);
  if (errors > 0) {
    console.log(`❌ Errors: ${errors}`);
  }
  console.log('\n📊 Sample Display Salaries:');
  
  const samples = await prisma.job.findMany({
    where: { displaySalary: { not: null } },
    select: {
      title: true,
      displaySalary: true,
      salaryPeriod: true,
    },
    take: 10,
  });

  samples.forEach((job: typeof samples[number]) => {
    console.log(`  - ${job.title}: ${job.displaySalary} (${job.salaryPeriod || 'annual'})`);
  });

  await prisma.$disconnect();
  console.log('\n✅ Display Salary Population Complete\n');
}

populateDisplaySalaries().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

