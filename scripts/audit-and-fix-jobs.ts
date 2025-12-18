import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function auditAndFixJobs() {
  console.log('🔍 PMHNP Job Board - Data Audit & Fix\n');
  console.log('='.repeat(60));

  // Get all published jobs
  const allJobs = await prisma.job.findMany({
    where: { isPublished: true },
    select: {
      id: true,
      title: true,
      description: true,
      jobType: true,
      isRemote: true,
      isHybrid: true,
      location: true,
      city: true,
      state: true,
      normalizedMinSalary: true,
      normalizedMaxSalary: true,
      createdAt: true,
    }
  });

  console.log(`\n📊 Total Published Jobs: ${allJobs.length}\n`);

  // Track issues
  const issues = {
    missingJobType: [] as string[],
    missingWorkMode: [] as string[],
    missingLocation: [] as string[],
  };

  // Track fixes to apply
  const fixes: Array<{ id: string; data: any }> = [];

  for (const job of allJobs) {
    // Fix 1: Job Type - Infer from title/description if missing
    if (!job.jobType) {
      const inferredJobType = inferJobType(job.title, job.description || '');
      if (inferredJobType) {
        fixes.push({ id: job.id, data: { jobType: inferredJobType } });
      } else {
        issues.missingJobType.push(job.id);
      }
    }

    // Fix 2: Work Mode - Infer from location/title if not set
    if (!job.isRemote && !job.isHybrid) {
      const inferredWorkMode = inferWorkMode(job.title, job.description || '', job.location || '');
      if (inferredWorkMode.isRemote || inferredWorkMode.isHybrid) {
        fixes.push({ id: job.id, data: inferredWorkMode });
      }
    }

    // Track jobs with no location that aren't remote
    if (!job.isRemote && !job.city && !job.state) {
      issues.missingLocation.push(job.id);
    }
  }

  console.log('\n📋 ISSUES FOUND:');
  console.log(`  Jobs missing jobType: ${issues.missingJobType.length}`);
  console.log(`  Jobs missing location (non-remote): ${issues.missingLocation.length}`);

  console.log(`\n🔧 FIXES TO APPLY: ${fixes.length}`);

  // Apply fixes
  if (fixes.length > 0) {
    console.log('\nApplying fixes...');
    for (const fix of fixes) {
      await prisma.job.update({
        where: { id: fix.id },
        data: fix.data,
      });
    }
    console.log(`✅ Applied ${fixes.length} fixes`);
  }

  // Final counts
  console.log('\n📊 FINAL BREAKDOWN:');
  
  const workModeCounts = {
    remote: await prisma.job.count({ where: { isPublished: true, isRemote: true } }),
    hybrid: await prisma.job.count({ where: { isPublished: true, isHybrid: true } }),
    inPerson: await prisma.job.count({ where: { isPublished: true, isRemote: false, isHybrid: false } }),
  };
  
  console.log('\n  Work Mode:');
  console.log(`    Remote: ${workModeCounts.remote}`);
  console.log(`    Hybrid: ${workModeCounts.hybrid}`);
  console.log(`    In-Person: ${workModeCounts.inPerson}`);
  console.log(`    Total: ${workModeCounts.remote + workModeCounts.hybrid + workModeCounts.inPerson}`);

  const jobTypeCounts = await prisma.job.groupBy({
    by: ['jobType'],
    where: { isPublished: true },
    _count: { _all: true },
  });

  console.log('\n  Job Type:');
  let jobTypeTotal = 0;
  for (const jt of jobTypeCounts) {
    console.log(`    ${jt.jobType || 'NULL'}: ${jt._count._all}`);
    jobTypeTotal += jt._count._all;
  }
  console.log(`    Total: ${jobTypeTotal}`);

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const freshJobs = await prisma.job.count({
    where: { isPublished: true, createdAt: { gte: weekAgo } },
  });

  const withSalary = await prisma.job.count({
    where: {
      isPublished: true,
      OR: [
        { normalizedMinSalary: { not: null } },
        { normalizedMaxSalary: { not: null } },
      ],
    },
  });

  const highPaying = await prisma.job.count({
    where: {
      isPublished: true,
      OR: [
        { normalizedMinSalary: { gte: 150000 } },
        { normalizedMaxSalary: { gte: 150000 } },
      ],
    },
  });

  console.log('\n  Other Metrics:');
  console.log(`    Posted this week: ${freshJobs}`);
  console.log(`    With salary data: ${withSalary}`);
  console.log(`    High paying ($150k+): ${highPaying}`);

  await prisma.$disconnect();
  console.log('\n✅ Audit Complete\n');
}

// Helper: Infer job type from title/description
function inferJobType(title: string, description: string): string | null {
  const text = `${title} ${description}`.toLowerCase();
  
  if (text.includes('per diem') || text.includes('prn')) {
    return 'Per Diem';
  }
  if (text.includes('contract') || text.includes('contractor') || text.includes('1099')) {
    return 'Contract';
  }
  if (text.includes('part-time') || text.includes('part time') || text.includes('pt ')) {
    return 'Part-Time';
  }
  if (text.includes('full-time') || text.includes('full time') || text.includes('ft ') || text.includes('permanent')) {
    return 'Full-Time';
  }
  
  // Default to Full-Time if no clear indicator
  return 'Full-Time';
}

// Helper: Infer work mode from title/description/location
function inferWorkMode(title: string, description: string, location: string): { isRemote?: boolean; isHybrid?: boolean } {
  const text = `${title} ${description} ${location}`.toLowerCase();
  
  if (text.includes('remote') || text.includes('work from home') || text.includes('wfh') || text.includes('telehealth only')) {
    if (text.includes('hybrid') || text.includes('partially remote') || text.includes('some remote')) {
      return { isHybrid: true };
    }
    return { isRemote: true };
  }
  
  if (text.includes('hybrid')) {
    return { isHybrid: true };
  }
  
  return {};
}

auditAndFixJobs().catch(console.error);

