import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const totalJobs = await prisma.job.count();
  const totalCompanies = await prisma.company.count();
  const jobsLinked = await prisma.job.count({ where: { companyId: { not: null } } });
  const jobsWithSalary = await prisma.job.count({ where: { minSalary: { not: null } } });
  
  console.log('='.repeat(50));
  console.log('📊 DATABASE STATUS');
  console.log('='.repeat(50));
  console.log(`Total Jobs: ${totalJobs}`);
  console.log(`Total Companies: ${totalCompanies}`);
  console.log(`Jobs Linked to Companies: ${jobsLinked} (${(jobsLinked/totalJobs*100).toFixed(1)}%)`);
  console.log(`Jobs with Salary Data: ${jobsWithSalary} (${(jobsWithSalary/totalJobs*100).toFixed(1)}%)`);
  console.log('='.repeat(50));
  
  if (totalCompanies > 0) {
    const topCompanies = await prisma.company.findMany({
      take: 10,
      orderBy: { jobCount: 'desc' },
      select: { name: true, jobCount: true, isVerified: true }
    });
    
    console.log('\n🏢 Top 10 Companies:');
    topCompanies.forEach((c, i) => {
      const verified = c.isVerified ? ' ✓' : '';
      console.log(`${i + 1}. ${c.name}${verified} - ${c.jobCount} jobs`);
    });
  }
  
  if (jobsWithSalary > 0) {
    const sampleSalaries = await prisma.job.findMany({
      where: { minSalary: { not: null } },
      take: 5,
      select: {
        title: true,
        minSalary: true,
        maxSalary: true,
        salaryPeriod: true,
      }
    });
    
    console.log('\n💰 Sample Jobs with Salaries:');
    sampleSalaries.forEach((j, i) => {
      const salary = j.maxSalary 
        ? `$${j.minSalary}-${j.maxSalary}/${j.salaryPeriod || 'yr'}`
        : `$${j.minSalary}/${j.salaryPeriod || 'yr'}`;
      console.log(`${i + 1}. ${j.title} - ${salary}`);
    });
  }
  
  console.log('\n' + '='.repeat(50));
  
  await prisma.$disconnect();
}

main().catch(console.error);

