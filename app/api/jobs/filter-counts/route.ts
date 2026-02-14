import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { FilterState, FilterCounts } from '@/types/filters';
import { buildWhereClause } from '@/lib/filters';

export async function POST(request: NextRequest) {
  try {
    const filters: FilterState = await request.json();

    // Base filters for all counts (excludes the specific category being counted)
    const baseFilters = { ...filters };

    // Work Mode counts
    // We want to see counts for other work modes given current filters, 
    // BUT satisfying the other active filters (like jobType, salary, etc)
    const workModeFilters = { ...baseFilters, workMode: [] };
    const workModeBase = buildWhereClause(workModeFilters);

    // Job Type counts
    const jobTypeFilters = { ...baseFilters, jobType: [] };
    const jobTypeBase = buildWhereClause(jobTypeFilters);

    // Salary counts
    const salaryFilters = { ...baseFilters, salaryMin: null };
    const salaryBase = buildWhereClause(salaryFilters);

    // Posted Within counts
    const postedFilters = { ...baseFilters, postedWithin: null };
    const postedBase = buildWhereClause(postedFilters);

    const now = new Date();

    const [
      remoteCount, hybridCount, onsiteCount,
      jobTypeCounts,
      anySalary, over100k, over150k, over200k,
      day, week, month,
      total
    ] = await Promise.all([
      // Work Mode
      prisma.job.count({ where: { AND: [workModeBase, { isRemote: true }] } }),
      prisma.job.count({ where: { AND: [workModeBase, { isHybrid: true }] } }),
      prisma.job.count({ where: { AND: [workModeBase, { isRemote: false, isHybrid: false }] } }),

      // Job Type
      prisma.job.groupBy({
        by: ['jobType'],
        where: jobTypeBase,
        _count: { _all: true },
      }),

      // Salary
      prisma.job.count({
        where: {
          AND: [
            salaryBase,
            {
              OR: [
                { normalizedMinSalary: { not: null } },
                { normalizedMaxSalary: { not: null } },
              ],
            },
          ],
        },
      }),
      prisma.job.count({
        where: {
          AND: [
            salaryBase,
            {
              OR: [
                { normalizedMinSalary: { gte: 100000 } },
                { normalizedMaxSalary: { gte: 100000 } },
              ],
            },
          ],
        },
      }),
      prisma.job.count({
        where: {
          AND: [
            salaryBase,
            {
              OR: [
                { normalizedMinSalary: { gte: 150000 } },
                { normalizedMaxSalary: { gte: 150000 } },
              ],
            },
          ],
        },
      }),
      prisma.job.count({
        where: {
          AND: [
            salaryBase,
            {
              OR: [
                { normalizedMinSalary: { gte: 200000 } },
                { normalizedMaxSalary: { gte: 200000 } },
              ],
            },
          ],
        },
      }),

      // Posted Within
      // Note: Using createdAt field (Job model doesn't have postedAt)
      prisma.job.count({
        where: {
          AND: [
            postedBase,
            {
              OR: [
                { originalPostedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
                {
                  AND: [
                    { originalPostedAt: null },
                    { createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
                  ],
                },
              ],
            },
          ],
        },
      }),
      prisma.job.count({
        where: {
          AND: [
            postedBase,
            {
              OR: [
                { originalPostedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
                {
                  AND: [
                    { originalPostedAt: null },
                    { createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
                  ],
                },
              ],
            },
          ],
        },
      }),
      prisma.job.count({
        where: {
          AND: [
            postedBase,
            {
              OR: [
                { originalPostedAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
                {
                  AND: [
                    { originalPostedAt: null },
                    { createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
                  ],
                },
              ],
            },
          ],
        },
      }),

      // Total
      prisma.job.count({
        where: buildWhereClause(filters),
      }),
    ]);

    const jobTypeMap: Record<string, number> = {};
    let knownTypeTotal = 0;
    for (const jt of jobTypeCounts) {
      if (jt.jobType) {
        jobTypeMap[jt.jobType] = jt._count._all;
        knownTypeTotal += jt._count._all;
      }
    }
    // Count jobs with NULL jobType as "Other"
    const nullTypeCount = jobTypeCounts.find((jt: { jobType: string | null }) => jt.jobType === null);
    const otherCount = nullTypeCount ? nullTypeCount._count._all : 0;

    // Specialty counts (keyword-based)
    const baseWhere = buildWhereClause(filters);
    const [telehealthCount, travelCount, newGradCount] = await Promise.all([
      prisma.job.count({
        where: {
          ...baseWhere,
          OR: [
            { title: { contains: 'telehealth', mode: 'insensitive' } },
            { title: { contains: 'telemedicine', mode: 'insensitive' } },
            { title: { contains: 'telepsychiatry', mode: 'insensitive' } },
            { description: { contains: 'telehealth', mode: 'insensitive' } },
            { description: { contains: 'telemedicine', mode: 'insensitive' } },
          ],
        },
      }),
      prisma.job.count({
        where: {
          ...baseWhere,
          OR: [
            { title: { contains: 'travel', mode: 'insensitive' } },
            { title: { contains: 'locum', mode: 'insensitive' } },
          ],
        },
      }),
      prisma.job.count({
        where: {
          ...baseWhere,
          OR: [
            { title: { contains: 'new grad', mode: 'insensitive' } },
            { title: { contains: 'new graduate', mode: 'insensitive' } },
            { title: { contains: 'entry level', mode: 'insensitive' } },
            { title: { contains: 'fellowship', mode: 'insensitive' } },
            { title: { contains: 'residency', mode: 'insensitive' } },
          ],
        },
      }),
    ]);

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
        'Other': otherCount,
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
      specialty: {
        Telehealth: telehealthCount,
        Travel: travelCount,
        'New Grad': newGradCount,
      },
      total,
    };

    return NextResponse.json(counts);
  } catch (error) {
    logger.error('Error calculating filter counts:', error);
    return NextResponse.json(
      { error: 'Failed to calculate filter counts' },
      { status: 500 }
    );
  }
}
