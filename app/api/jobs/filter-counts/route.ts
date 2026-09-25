import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { FilterState, FilterCounts } from '@/types/filters';
import {
  buildWhereClause,
  easyApplyClause,
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

    /**
     * Numeric filter values arrive as untrusted JSON on a public, unauthenticated
     * endpoint (/jobs POSTs here on every visit). `JSON.parse` turns `1e400` into
     * `Infinity`, which is a `number` and satisfies a bare `typeof`/`>= 0` guard,
     * and a string like "abc" used to be copied straight through — both reached
     * Prisma as an unserializable filter value and answered 500. Only a finite,
     * non-negative number is a filter; anything else means "no filter", matching
     * what lib/filters.ts parseFiltersFromParams already does for the GET path.
     */
    const finiteFilterNumber = (value: unknown): number | null => {
      if (typeof value !== 'number') return null;
      return Number.isFinite(value) && value >= 0 ? value : null;
    };
    /** The multi-select facets. A non-array is not a partial selection, it is noise. */
    const stringList = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
    /** The single-value text facets. buildWhereClause calls string methods on these. */
    const optionalString = (value: unknown): string | null =>
      typeof value === 'string' && value !== '' ? value : null;

    // Normalize: ensure all array fields exist (handles old clients without experienceLevel)
    const filters: FilterState = {
      search: typeof raw.search === 'string' ? raw.search : '',
      workMode: stringList(raw.workMode),
      jobType: stringList(raw.jobType),
      specialty: stringList(raw.specialty),
      experienceLevel: stringList(raw.experienceLevel),
      newGradFriendly: raw.newGradFriendly === true ? true : null,
      minYearsExperience: finiteFilterNumber(raw.minYearsExperience),
      easyApply: raw.easyApply === true ? true : null,
      salaryMin: finiteFilterNumber(raw.salaryMin),
      postedWithin: optionalString(raw.postedWithin),
      location: optionalString(raw.location),
      cityExact: optionalString(raw.cityExact),
      stateCode: optionalString(raw.stateCode),
      employer: optionalString(raw.employer),
      category: optionalString(raw.category),
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

    // "Direct employers / Easy Apply" — same shared clause buildWhereClause
    // applies, with the filter excluded from its own base (no self-filter).
    const easyApplyBase = buildWhereClause({ ...baseFilters, easyApply: null });

    // Only the live candidate buckets {1,2,5} — 7+/10+ were provably identical
    // to 5+ (no job states a minimum above 5 years) and were removed.
    const [newGradCount, minY1, minY2, minY5, easyApplyCount] = await Promise.all([
      prisma.job.count({ where: { AND: [newGradBase, newGradMatchClause] } }),
      prisma.job.count({ where: { AND: [minYearsBase, minYearsQualifyClause(1)] } }),
      prisma.job.count({ where: { AND: [minYearsBase, minYearsQualifyClause(2)] } }),
      prisma.job.count({ where: { AND: [minYearsBase, minYearsQualifyClause(5)] } }),
      prisma.job.count({ where: { AND: [easyApplyBase, easyApplyClause()] } }),
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
      easyApply: easyApplyCount,
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
