import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const output: string[] = [];
    
    output.push('🔍 PMHNP Job Board - Filter Data Audit\n');
    output.push('='.repeat(60));

    // Total jobs
    const totalJobs = await prisma.job.count({
      where: { isPublished: true }
    });
    output.push(`\n📊 Total Published Jobs: ${totalJobs}\n`);

    // Work Mode breakdown
    output.push('📍 WORK MODE BREAKDOWN:');
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
    
    output.push(`  Remote: ${remoteCount}`);
    output.push(`  Hybrid: ${hybridCount}`);
    output.push(`  In-Person: ${inPersonCount}`);
    output.push(`  Total: ${remoteCount + hybridCount + inPersonCount}`);
    if (remoteCount + hybridCount + inPersonCount !== totalJobs) {
      output.push(`  ⚠️ MISMATCH: ${totalJobs - (remoteCount + hybridCount + inPersonCount)} jobs uncategorized`);
    }

    // Job Type breakdown
    output.push('\n💼 JOB TYPE BREAKDOWN:');
    const jobTypes = await prisma.job.groupBy({
      by: ['jobType'],
      where: { isPublished: true },
      _count: { _all: true }
    });
    
    let jobTypeTotal = 0;
    for (const type of jobTypes) {
      output.push(`  ${type.jobType || 'NULL'}: ${type._count._all}`);
      jobTypeTotal += type._count._all;
    }
    output.push(`  Total: ${jobTypeTotal}`);
    
    const nullJobType = await prisma.job.count({
      where: { isPublished: true, jobType: null }
    });
    if (nullJobType > 0) {
      output.push(`  ⚠️ WARNING: ${nullJobType} jobs have NULL jobType`);
    }

    // Salary data
    output.push('\n💰 SALARY DATA:');
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
    output.push(`  Jobs with salary: ${withSalary} (${(withSalary/totalJobs*100).toFixed(1)}%)`);
    output.push(`  High paying (>$150k): ${highPaying}`);

    // Posted date
    output.push('\n📅 FRESHNESS:');
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const today = await prisma.job.count({
      where: { isPublished: true, postedAt: { gte: oneDayAgo } }
    });
    const thisWeek = await prisma.job.count({
      where: { isPublished: true, postedAt: { gte: oneWeekAgo } }
    });
    const thisMonth = await prisma.job.count({
      where: { isPublished: true, postedAt: { gte: oneMonthAgo } }
    });
    const older = await prisma.job.count({
      where: { isPublished: true, postedAt: { lt: oneMonthAgo } }
    });
    
    output.push(`  Posted today: ${today}`);
    output.push(`  Posted this week: ${thisWeek}`);
    output.push(`  Posted this month: ${thisMonth}`);
    output.push(`  Older than 30 days: ${older}`);

    // Location data
    output.push('\n🌍 LOCATION DATA:');
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
    
    output.push(`  With state: ${withState}`);
    output.push(`  With city: ${withCity}`);
    output.push(`  No location (not remote): ${noLocation}`);
    if (noLocation > 0) {
      output.push(`  ⚠️ WARNING: ${noLocation} non-remote jobs have no location`);
    }

    // Top states
    output.push('\n🏛️ TOP STATES:');
    const topStates = await prisma.job.groupBy({
      by: ['state'],
      where: { isPublished: true, state: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { state: 'desc' } },
      take: 10
    });
    
    for (const state of topStates) {
      output.push(`  ${state.state}: ${state._count._all}`);
    }

    // Source breakdown
    output.push('\n📡 SOURCE BREAKDOWN:');
    const sources = await prisma.job.groupBy({
      by: ['source'],
      where: { isPublished: true },
      _count: { _all: true },
      orderBy: { _count: { source: 'desc' } }
    });
    
    for (const source of sources) {
      output.push(`  ${source.source}: ${source._count._all}`);
    }

    output.push('\n' + '='.repeat(60));
    output.push('✅ Audit Complete\n');

    return new NextResponse(output.join('\n'), {
      headers: { 'Content-Type': 'text/plain' }
    });
  } catch (error) {
    console.error('Audit error:', error);
    return NextResponse.json({ error: 'Failed to run audit' }, { status: 500 });
  }
}

