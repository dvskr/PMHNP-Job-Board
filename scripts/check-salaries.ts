import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

config();

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const totalJobs = await prisma.job.count();
  
  const withMinSalary = await prisma.job.count({
    where: { minSalary: { not: null } }
  });
  
  const withMaxSalary = await prisma.job.count({
    where: { maxSalary: { not: null } }
  });
  
  const withNormalizedMin = await prisma.job.count({
    where: { normalizedMinSalary: { not: null } }
  });
  
  const withNormalizedMax = await prisma.job.count({
    where: { normalizedMaxSalary: { not: null } }
  });
  
  const withSalaryRange = await prisma.job.count({
    where: { salaryRange: { not: null } }
  });
  
  console.log('='.repeat(50));
  console.log('SALARY DATA SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total Jobs: ${totalJobs}`);
  console.log(`\nOriginal Salary Fields:`);
  console.log(`  Jobs with minSalary: ${withMinSalary} (${(withMinSalary/totalJobs*100).toFixed(1)}%)`);
  console.log(`  Jobs with maxSalary: ${withMaxSalary} (${(withMaxSalary/totalJobs*100).toFixed(1)}%)`);
  console.log(`  Jobs with salaryRange: ${withSalaryRange} (${(withSalaryRange/totalJobs*100).toFixed(1)}%)`);
  console.log(`\nNormalized Salary Fields:`);
  console.log(`  Jobs with normalizedMinSalary: ${withNormalizedMin} (${(withNormalizedMin/totalJobs*100).toFixed(1)}%)`);
  console.log(`  Jobs with normalizedMaxSalary: ${withNormalizedMax} (${(withNormalizedMax/totalJobs*100).toFixed(1)}%)`);
  
  console.log(`\nSample jobs with salary data:`);
  const samplesWithSalary = await prisma.job.findMany({
    where: {
      OR: [
        { minSalary: { not: null } },
        { normalizedMinSalary: { not: null } }
      ]
    },
    take: 3,
    select: {
      title: true,
      employer: true,
      minSalary: true,
      maxSalary: true,
      salaryPeriod: true,
      normalizedMinSalary: true,
      normalizedMaxSalary: true,
      salaryRange: true,
    }
  });
  
  samplesWithSalary.forEach((job, i) => {
    console.log(`\n${i + 1}. ${job.title} - ${job.employer}`);
    console.log(`   Original: min=${job.minSalary}, max=${job.maxSalary}, period=${job.salaryPeriod}`);
    console.log(`   Normalized: min=${job.normalizedMinSalary}, max=${job.normalizedMaxSalary}`);
    console.log(`   Range: ${job.salaryRange}`);
  });
  
  console.log('='.repeat(50));
  
  await prisma.$disconnect();
}

main().catch(console.error);

