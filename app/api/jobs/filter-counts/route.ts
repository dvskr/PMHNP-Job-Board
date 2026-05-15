import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';
import { FilterState, FilterCounts } from '@/types/filters';
import { buildWhereClause, freshnessClause, CATEGORY_FILTERS, CATEGORY_EXCLUSIONS } from '@/lib/filters';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'filter-counts', RATE_LIMITS.general);
    if (rateLimitResult) return rateLimitResult;

  try {
    const raw = await request.json();
    // Normalize: ensure all array fields exist (handles old clients without experienceLevel)
    const filters: FilterState = {
      search: raw.search || '',
      workMode: raw.workMode || [],
      jobType: raw.jobType || [],
      specialty: raw.specialty || [],
      experienceLevel: raw.experienceLevel || [],
      newGradFriendly: raw.newGradFriendly === true ? true : null,
      minYearsExperience:
        typeof raw.minYearsExperience === 'number' && raw.minYearsExperience >= 0
          ? raw.minYearsExperience
          : null,
      salaryMin: raw.salaryMin ?? null,
      postedWithin: raw.postedWithin ?? null,
      location: raw.location ?? null,
      cityExact: raw.cityExact ?? null,
      stateCode: raw.stateCode ?? null,
      employer: raw.employer ?? null,
      category: raw.category ?? null,
    };

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
      day, threeDays, week, month,
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

      // Posted Within — see lib/filters.ts:freshnessClause for semantics.
      // Past 24h
      prisma.job.count({
        where: { AND: [postedBase, freshnessClause(now, '24h')] },
      }),
      // Past 3 days
      prisma.job.count({
        where: { AND: [postedBase, freshnessClause(now, '3d')] },
      }),
      // Past week
      prisma.job.count({
        where: { AND: [postedBase, freshnessClause(now, '7d')] },
      }),
      // Past month
      prisma.job.count({
        where: { AND: [postedBase, freshnessClause(now, '30d')] },
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
    // Exclude specialty filter from base so counts don't self-filter
    const specialtyFilters = { ...baseFilters, specialty: [] };
    const specialtyBase = buildWhereClause(specialtyFilters);
    // Wrap the keyword OR inside the AND envelope so it composes with
    // `specialtyBase`'s own AND-conditions instead of overriding them
    // when other filters are active. Mirrors how /jobs adds specialty
    // via `andConditions.push({OR:[...]})`.
    const [telehealthCount, travelCount] = await Promise.all([
      prisma.job.count({
        where: {
          AND: [
            specialtyBase,
            {
              OR: [
                { title: { contains: 'telehealth', mode: 'insensitive' } },
                { title: { contains: 'telemedicine', mode: 'insensitive' } },
                { title: { contains: 'telepsychiatry', mode: 'insensitive' } },
                { description: { contains: 'telehealth', mode: 'insensitive' } },
                { description: { contains: 'telemedicine', mode: 'insensitive' } },
              ],
            },
          ],
        },
      }),
      prisma.job.count({
        where: {
          AND: [
            specialtyBase,
            {
              OR: [
                { title: { contains: 'travel', mode: 'insensitive' } },
                { title: { contains: 'locum', mode: 'insensitive' } },
              ],
            },
          ],
        },
      }),
    ]);

    // Experience Level counts (from DB column, not keyword matching)
    // Exclude experienceLevel filter from base so counts don't self-filter
    const expFilters = { ...baseFilters, experienceLevel: [] };
    const expBase = buildWhereClause(expFilters);
    const expLevelCounts = await prisma.job.groupBy({
      by: ['experienceLevel'],
      where: expBase,
      _count: { _all: true },
    });
    const expMap: Record<string, number> = {};
    for (const el of expLevelCounts) {
      if (el.experienceLevel) {
        expMap[el.experienceLevel] = el._count._all;
      }
    }

    // Phase 1 structured experience counts. We exclude each respective
    // filter from its own base so the badge count doesn't self-filter.
    const newGradBase = buildWhereClause({ ...baseFilters, newGradFriendly: null });
    const minYearsBase = buildWhereClause({ ...baseFilters, minYearsExperience: null });
    // Mirror buildWhereClause's candidate-qualifies semantics: a job
    // matches "I have N years" if its minYearsExperience is either
    // ≤ N (explicit requirement) OR null (no requirement specified).
    // Without the null branch the counts undercount by ~the entire
    // un-backfilled aggregated inventory and confuse users — a
    // 10-year veteran would see fewer matches than expected.
    const qualifiesFor = (n: number) => ({
      OR: [
        { minYearsExperience: { lte: n } },
        { minYearsExperience: null },
      ],
    });
    // Unified new-grad match (mirrors buildWhereClause): explicit flag
    // OR title keyword match minus the CATEGORY_EXCLUSIONS. Same clause
    // shape so the badge count agrees with what the filter returns.
    const newGradOrClauses: Prisma.JobWhereInput[] = [
      { newGradFriendly: true },
      ...(CATEGORY_FILTERS['new-grad'] ?? []),
    ];
    const newGradNotClauses: Prisma.JobWhereInput[] = (CATEGORY_EXCLUSIONS['new-grad'] ?? []).map((ex) => ({ NOT: ex }));
    const newGradMatchClause: Prisma.JobWhereInput = {
      AND: [{ OR: newGradOrClauses }, ...newGradNotClauses],
    };

    const [newGradCount, minY1, minY2, minY5, minY7, minY10] = await Promise.all([
      prisma.job.count({ where: { AND: [newGradBase, newGradMatchClause] } }),
      prisma.job.count({ where: { AND: [minYearsBase, qualifiesFor(1)] } }),
      prisma.job.count({ where: { AND: [minYearsBase, qualifiesFor(2)] } }),
      prisma.job.count({ where: { AND: [minYearsBase, qualifiesFor(5)] } }),
      prisma.job.count({ where: { AND: [minYearsBase, qualifiesFor(7)] } }),
      prisma.job.count({ where: { AND: [minYearsBase, qualifiesFor(10)] } }),
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
        '3d': threeDays,
        '7d': week,
        '30d': month,
      },
      specialty: {
        Telehealth: telehealthCount,
        Travel: travelCount,
      },
      experienceLevel: {
        'New Grad': expMap['New Grad'] || 0,
        'Mid-Level': expMap['Mid-Level'] || 0,
        'Senior': expMap['Senior'] || 0,
      },
      newGradFriendly: newGradCount,
      minYears: {
        1: minY1,
        2: minY2,
        5: minY5,
        7: minY7,
        10: minY10,
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
