import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { prisma } from '../lib/prisma';

async function verifyLocationData() {
  console.log('Verifying location data...\n');
  
  // Get sample jobs with parsed locations
  const jobs = await prisma.job.findMany({
    where: {
      isPublished: true,
    },
    select: {
      title: true,
      location: true,
      city: true,
      state: true,
      stateCode: true,
      isRemote: true,
      isHybrid: true,
    },
    take: 15,
  });

  console.log(`Sample of ${jobs.length} jobs:\n`);
  console.log('='.repeat(100));
  
  for (const job of jobs) {
    console.log(`\nOriginal:  ${job.location}`);
    console.log(`Parsed:    City: ${job.city || 'N/A'} | State: ${job.state || 'N/A'} (${job.stateCode || 'N/A'})`);
    console.log(`           Remote: ${job.isRemote} | Hybrid: ${job.isHybrid}`);
  }
  
  console.log('\n' + '='.repeat(100));
  
  // Get statistics
  const stats = {
    total: await prisma.job.count(),
    withCity: await prisma.job.count({ where: { city: { not: null } } }),
    withState: await prisma.job.count({ where: { state: { not: null } } }),
    remote: await prisma.job.count({ where: { isRemote: true } }),
    hybrid: await prisma.job.count({ where: { isHybrid: true } }),
  };
  
  console.log('\n📊 Location Statistics:');
  console.log(`Total jobs: ${stats.total}`);
  console.log(`With city: ${stats.withCity} (${((stats.withCity / stats.total) * 100).toFixed(1)}%)`);
  console.log(`With state: ${stats.withState} (${((stats.withState / stats.total) * 100).toFixed(1)}%)`);
  console.log(`Remote jobs: ${stats.remote} (${((stats.remote / stats.total) * 100).toFixed(1)}%)`);
  console.log(`Hybrid jobs: ${stats.hybrid} (${((stats.hybrid / stats.total) * 100).toFixed(1)}%)`);
  
  await prisma.$disconnect();
}

verifyLocationData().catch(console.error);

