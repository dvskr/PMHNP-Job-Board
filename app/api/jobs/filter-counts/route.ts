import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { FilterState, FilterCounts } from '@/types/filters';
import { buildWhereClause } from '@/lib/filters';

export async function POST(request: NextRequest) {
  try {
    const filters: FilterState = await request.json();
    
    // Base where clause with current filters (for calculating counts of other options)
    const baseFilters = { ...filters };
    
    // Calculate counts for each filter category
    // The key is: show count IF user selects this option (considering other active filters)
    
    // Work Mode counts
    const workModeFilters = { ...baseFilters, workMode: [] };
    const workModeBase = buildWhereClause(workModeFilters);
    
    const [remoteCount, hybridCount, onsiteCount] = await Promise.all([
      prisma.job.count({ where: { ...workModeBase, isRemote: true } }),
      prisma.job.count({ where: { ...workModeBase, isHybrid: true } }),
      prisma.job.count({ where: { ...workModeBase, isRemote: false, isHybrid: false } }),
    ]);

    // Job Type counts
    const jobTypeFilters = { ...baseFilters, jobType: [] };
    const jobTypeBase = buildWhereClause(jobTypeFilters);
    
    const jobTypeCounts = await prisma.job.groupBy({
      by: ['jobType'],
      where: jobTypeBase,
      _count: { _all: true },
    });
    
    const jobTypeMap: Record<string, number> = {};
    for (const jt of jobTypeCounts) {
      if (jt.jobType) {
        jobTypeMap[jt.jobType] = jt._count._all;
      }
    }

    // Salary counts
    const salaryFilters = { ...baseFilters, salaryMin: null };
    const salaryBase = buildWhereClause(salaryFilters);
    
    const [anySalary, over100k, over150k, over200k] = await Promise.all([
      prisma.job.count({
        where: {
          ...salaryBase,
          OR: [
            { normalizedMinSalary: { not: null } },
            { normalizedMaxSalary: { not: null } },
          ],
        },
      }),
      prisma.job.count({
        where: {
          ...salaryBase,
          OR: [
            { normalizedMinSalary: { gte: 100000 } },
            { normalizedMaxSalary: { gte: 100000 } },
          ],
        },
      }),
      prisma.job.count({
        where: {
          ...salaryBase,
          OR: [
            { normalizedMinSalary: { gte: 150000 } },
            { normalizedMaxSalary: { gte: 150000 } },
          ],
        },
      }),
      prisma.job.count({
        where: {
          ...salaryBase,
          OR: [
            { normalizedMinSalary: { gte: 200000 } },
            { normalizedMaxSalary: { gte: 200000 } },
          ],
        },
      }),
    ]);

    // Posted Within counts
    const now = new Date();
    const postedFilters = { ...baseFilters, postedWithin: null };
    const postedBase = buildWhereClause(postedFilters);
    
    // Note: Using createdAt field (Job model doesn't have postedAt)
    const [day, week, month] = await Promise.all([
      prisma.job.count({
        where: {
          ...postedBase,
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.job.count({
        where: {
          ...postedBase,
          createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.job.count({
        where: {
          ...postedBase,
          createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    // Total with all current filters
    const total = await prisma.job.count({
      where: buildWhereClause(filters),
    });

    const counts: FilterCounts = {
      workMode: {
        remote: remoteCount,
        hybrid: hybridCount,
        onsite: onsiteCount,
      },
      jobType: {
        'Full-Time': jobTypeMap['Full-Time'] || 0,
        'Part-Time': jobTypeMap['Part-Time'] || 0,
        'Contract': jobTypeMap['Contract'] || 0,
        'Per Diem': jobTypeMap['Per Diem'] || 0,
      },
      salary: {
        any: anySalary,
        over100k,
        over150k,
        over200k,
      },
      postedWithin: {
        '24h': day,
        '7d': week,
        '30d': month,
      },
      total,
    };

    return NextResponse.json(counts);
  } catch (error) {
    console.error('Error calculating filter counts:', error);
    return NextResponse.json(
      { error: 'Failed to calculate filter counts' },
      { status: 500 }
    );
  }
}

