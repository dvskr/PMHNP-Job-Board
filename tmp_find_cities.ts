import { prisma } from './lib/prisma';

async function main() {
  const jobs = await prisma.job.groupBy({
    by: ['city', 'state'],
    where: { isPublished: true },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });
  console.log('Top cities with jobs:');
  jobs.forEach(j => console.log(`  ${j.city}, ${j.state} = ${j._count.id} jobs`));
  await prisma.$disconnect();
}
main();
