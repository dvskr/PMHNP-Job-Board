import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

// Use DIRECT_URL for direct database access
const connectionString = process.env.DIRECT_URL;

if (!connectionString) {
  throw new Error('DIRECT_URL environment variable is not set');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function auditJobFilters() {
  console.log('🔍 PMHNP Job Board - Filter Data Audit\n');
  console.log('='.repeat(60));

  // Total jobs
  const totalJobs = await prisma.job.count({
    where: { isPublished: true }
  });
  console.log(`\n📊 Total Published Jobs: ${totalJobs}\n`);

  // Work Mode breakdown
  console.log('📍 WORK MODE BREAKDOWN:');
  const remoteCount = await prisma.job.count({
    where: { isPublished: true, isRemote: true }
  });
  const hybridCount = await prisma.job.count({
    where: { isPublished: true, isHybrid: true }
  });
  const inPersonCount = await prisma.job.count({
    where: { 
      isPublished: true, 
      isRemote: false, 
      isHybrid: false 
    }
  });
  
  console.log(`  Remote: ${remoteCount}`);
  console.log(`  Hybrid: ${hybridCount}`);
  console.log(`  In-Person: ${inPersonCount}`);
  console.log(`  Total: ${remoteCount + hybridCount + inPersonCount}`);
  if (remoteCount + hybridCount + inPersonCount !== totalJobs) {
    console.log(`  ⚠️ MISMATCH: ${totalJobs - (remoteCount + hybridCount + inPersonCount)} jobs uncategorized`);
  }

  // Job Type breakdown
  console.log('\n💼 JOB TYPE BREAKDOWN:');
  const jobTypes = await prisma.job.groupBy({
    by: ['jobType'],
    where: { isPublished: true },
    _count: { _all: true }
  });
  
  let jobTypeTotal = 0;
  for (const type of jobTypes) {
    console.log(`  ${type.jobType || 'NULL'}: ${type._count._all}`);
    jobTypeTotal += type._count._all;
  }
  console.log(`  Total: ${jobTypeTotal}`);
  
  const nullJobType = await prisma.job.count({
    where: { isPublished: true, jobType: null }
  });
  if (nullJobType > 0) {
    console.log(`  ⚠️ WARNING: ${nullJobType} jobs have NULL jobType`);
  }

  // Salary data
  console.log('\n💰 SALARY DATA:');
  const withSalary = await prisma.job.count({
    where: {
      isPublished: true,
      OR: [
        { minSalary: { not: null } },
        { maxSalary: { not: null } },
        { normalizedMinSalary: { not: null } },
        { normalizedMaxSalary: { not: null } }
      ]
    }
  });
  const highPaying = await prisma.job.count({
    where: {
      isPublished: true,
      OR: [
        { normalizedMinSalary: { gte: 150000 } },
        { normalizedMaxSalary: { gte: 150000 } }
      ]
    }
  });
  console.log(`  Jobs with salary: ${withSalary} (${(withSalary/totalJobs*100).toFixed(1)}%)`);
  console.log(`  High paying (>$150k): ${highPaying}`);

  // Posted date
  console.log('\n📅 FRESHNESS:');
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const today = await prisma.job.count({
    where: { isPublished: true, createdAt: { gte: oneDayAgo } }
  });
  const thisWeek = await prisma.job.count({
    where: { isPublished: true, createdAt: { gte: oneWeekAgo } }
  });
  const thisMonth = await prisma.job.count({
    where: { isPublished: true, createdAt: { gte: oneMonthAgo } }
  });
  const older = await prisma.job.count({
    where: { isPublished: true, createdAt: { lt: oneMonthAgo } }
  });
  
  console.log(`  Posted today: ${today}`);
  console.log(`  Posted this week: ${thisWeek}`);
  console.log(`  Posted this month: ${thisMonth}`);
  console.log(`  Older than 30 days: ${older}`);

  // Location data
  console.log('\n🌍 LOCATION DATA:');
  const withState = await prisma.job.count({
    where: { isPublished: true, state: { not: null } }
  });
  const withCity = await prisma.job.count({
    where: { isPublished: true, city: { not: null } }
  });
  const noLocation = await prisma.job.count({
    where: { 
      isPublished: true, 
      state: null,
      city: null,
      isRemote: false
    }
  });
  
  console.log(`  With state: ${withState}`);
  console.log(`  With city: ${withCity}`);
  console.log(`  No location (not remote): ${noLocation}`);
  if (noLocation > 0) {
    console.log(`  ⚠️ WARNING: ${noLocation} non-remote jobs have no location`);
  }

  // Top states
  console.log('\n🏛️ TOP STATES:');
  const topStates = await prisma.job.groupBy({
    by: ['state'],
    where: { isPublished: true, state: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { state: 'desc' } },
    take: 10
  });
  
  for (const state of topStates) {
    console.log(`  ${state.state}: ${state._count._all}`);
  }

  // Source breakdown
  console.log('\n📡 SOURCE BREAKDOWN:');
  const sources = await prisma.job.groupBy({
    by: ['sourceProvider'],
    where: { isPublished: true, sourceProvider: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { sourceProvider: 'desc' } }
  });
  
  for (const source of sources) {
    console.log(`  ${source.sourceProvider}: ${source._count._all}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Audit Complete\n');

  await prisma.$disconnect();
  await pool.end();
}

auditJobFilters().catch(console.error);

