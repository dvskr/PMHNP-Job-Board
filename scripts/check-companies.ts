import { prisma } from '../lib/prisma';

async function main() {
  const companyCount = await prisma.company.count();
  const jobsLinked = await prisma.job.count({
    where: { companyId: { not: null } }
  });
  const totalJobs = await prisma.job.count();
  
  console.log('='.repeat(50));
  console.log('DATABASE STATUS');
  console.log('='.repeat(50));
  console.log(`Total Companies: ${companyCount}`);
  console.log(`Total Jobs: ${totalJobs}`);
  console.log(`Jobs Linked to Companies: ${jobsLinked}`);
  console.log(`Jobs NOT Linked: ${totalJobs - jobsLinked}`);
  console.log('='.repeat(50));
  
  if (companyCount > 0) {
    console.log('\nTop 10 Companies by Job Count:');
    const topCompanies = await prisma.company.findMany({
      take: 10,
      orderBy: { jobCount: 'desc' },
      select: { name: true, jobCount: true, isVerified: true }
    });
    topCompanies.forEach((c, i) => {
      console.log(`${i + 1}. ${c.name} - ${c.jobCount} jobs ${c.isVerified ? '✓' : ''}`);
    });
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);

