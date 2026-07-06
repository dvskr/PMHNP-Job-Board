import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { FilterState, FilterCounts } from '@/types/filters';
import {
  buildWhereClause,
  freshnessClause,
  jobTypeClause,
  minYearsQualifyClause,
  newGradWhereClause,
  salaryAtLeastClause,
  specialtyClause,
  workModeClause,
} from '@/lib/filters';
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
      fullTimeCount, partTimeCount, contractCount, perDiemCount, otherCount,
      anySalary, over100k, over150k, over200k,
      day, threeDays, week, month,
      total
    ] = await Promise.all([
      // Work Mode — same per-mode clauses the /jobs WHERE uses.
      prisma.job.count({ where: { AND: [workModeBase, workModeClause('remote')] } }),
      prisma.job.count({ where: { AND: [workModeBase, workModeClause('hybrid')] } }),
      prisma.job.count({ where: { AND: [workModeBase, workModeClause('onsite')] } }),

      // Job Type — per-option counts through the same jobTypeClause the
      // /jobs WHERE uses ('Other' ⇔ NULL jobType). Replaces the old groupBy
      // whose NULL→'Other' mapping was hand-mirrored here.
      prisma.job.count({ where: { AND: [jobTypeBase, jobTypeClause(['Full-Time'])] } }),
      prisma.job.count({ where: { AND: [jobTypeBase, jobTypeClause(['Part-Time'])] } }),
      prisma.job.count({ where: { AND: [jobTypeBase, jobTypeClause(['Contract'])] } }),
      prisma.job.count({ where: { AND: [jobTypeBase, jobTypeClause(['Per Diem'])] } }),
      prisma.job.count({ where: { AND: [jobTypeBase, jobTypeClause(['Other'])] } }),

      // Salary — "any" is route-only (has a stated salary at all); the
      // floor counts share salaryAtLeastClause with the /jobs WHERE.
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
      prisma.job.count({ where: { AND: [salaryBase, salaryAtLeastClause(100000)] } }),
      prisma.job.count({ where: { AND: [salaryBase, salaryAtLeastClause(150000)] } }),
      prisma.job.count({ where: { AND: [salaryBase, salaryAtLeastClause(200000)] } }),

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

    // Specialty counts (keyword-based)
    // Exclude specialty filter from base so counts don't self-filter
    const specialtyFilters = { ...baseFilters, specialty: [] };
    const specialtyBase = buildWhereClause(specialtyFilters);
    // Wrap the shared keyword clause inside the AND envelope so it composes
    // with `specialtyBase`'s own AND-conditions instead of overriding them
    // when other filters are active. Mirrors how /jobs adds specialty
    // via `andConditions.push({OR:[...]})` — same specialtyClause per option.
    const [telehealthCount, travelCount] = await Promise.all([
      prisma.job.count({
        where: { AND: [specialtyBase, specialtyClause('Telehealth')] },
      }),
      prisma.job.count({
        where: { AND: [specialtyBase, specialtyClause('Travel')] },
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
    // Candidate-qualifies clause + null handling are shared with
    // buildWhereClause via minYearsQualifyClause / EXPERIENCE_NULL_QUALIFIES,
    // so the badge counts and the actual filter predicate can never diverge.
    // New-grad match is the SAME shared clause buildWhereClause uses
    // (newGradFriendly OR minYearsExperience=0 OR title keywords, minus
    // exclusions), so the badge count can never disagree with the filter.
    const newGradMatchClause = newGradWhereClause();

    // Only the live candidate buckets {1,2,5} — 7+/10+ were provably identical
    // to 5+ (no job states a minimum above 5 years) and were removed.
    const [newGradCount, minY1, minY2, minY5] = await Promise.all([
      prisma.job.count({ where: { AND: [newGradBase, newGradMatchClause] } }),
      prisma.job.count({ where: { AND: [minYearsBase, minYearsQualifyClause(1)] } }),
      prisma.job.count({ where: { AND: [minYearsBase, minYearsQualifyClause(2)] } }),
      prisma.job.count({ where: { AND: [minYearsBase, minYearsQualifyClause(5)] } }),
    ]);

    const counts: FilterCounts = {
      workMode: {
        remote: remoteCount,
        hybrid: hybridCount,
        onsite: onsiteCount,
      },
      jobType: {
        'Full-Time': fullTimeCount,
        'Part-Time': partTimeCount,
        'Contract': contractCount,
        'Per Diem': perDiemCount,
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
