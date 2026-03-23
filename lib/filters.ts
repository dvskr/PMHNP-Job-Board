import { Prisma } from '@prisma/client';
import { FilterState } from '@/types/filters';

export function buildWhereClause(filters: FilterState): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = {
    isPublished: true,
  };

  const andConditions: Prisma.JobWhereInput[] = [];

  // Search
  if (filters.search && filters.search.trim()) {
    andConditions.push({
      OR: [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { employer: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { city: { contains: filters.search, mode: 'insensitive' } },
        { state: { contains: filters.search, mode: 'insensitive' } },
      ],
    });
  }

  // Work Mode (OR within category)
  if (filters.workMode.length > 0) {
    const workModeConditions: Prisma.JobWhereInput[] = [];

    if (filters.workMode.includes('remote')) {
      workModeConditions.push({ isRemote: true });
    }
    if (filters.workMode.includes('hybrid')) {
      workModeConditions.push({ isHybrid: true });
    }
    if (filters.workMode.includes('onsite')) {
      workModeConditions.push({ isRemote: false, isHybrid: false });
    }

    if (workModeConditions.length > 0) {
      andConditions.push({ OR: workModeConditions });
    }
  }

  // Job Type (OR within category)
  if (filters.jobType.length > 0) {
    const hasOther = filters.jobType.includes('Other');
    const namedTypes = filters.jobType.filter(t => t !== 'Other');

    if (hasOther && namedTypes.length > 0) {
      // Match named types OR NULL
      andConditions.push({
        OR: [
          { jobType: { in: namedTypes } },
          { jobType: null },
        ],
      });
    } else if (hasOther) {
      // Only "Other" selected — match NULL
      andConditions.push({ jobType: null });
    } else {
      // Only named types
      andConditions.push({ jobType: { in: namedTypes } });
    }
  }

  // Salary
  if (filters.salaryMin) {
    andConditions.push({
      OR: [
        { normalizedMinSalary: { gte: filters.salaryMin } },
        { normalizedMaxSalary: { gte: filters.salaryMin } },
      ],
    });
  }

  // Posted Within
  if (filters.postedWithin && filters.postedWithin !== 'all') {
    const now = new Date();

    // Source-specific rule: fantastic-jobs-db reports originalPostedAt 4-7 days
    // behind actual ingestion. If the gap is ≤ 7 days, use createdAt instead.
    const SLOW_SOURCE_GAP_DAYS = 7;
    const slowSourceGapCutoff = new Date(now.getTime() - SLOW_SOURCE_GAP_DAYS * 24 * 60 * 60 * 1000);

    // Helper: build postedWithin condition with source-specific handling
    const buildPostedWithinCondition = (cutoff: Date): Prisma.JobWhereInput => ({
      OR: [
        // 1. originalPostedAt is within the filter window (all sources)
        { originalPostedAt: { gte: cutoff } },
        // 2. No originalPostedAt — fallback to createdAt (all sources)
        {
          AND: [
            { originalPostedAt: null },
            { createdAt: { gte: cutoff } },
          ],
        },
        // 3. fantastic-jobs-db: if originalPostedAt is within 7d of ingestion,
        //    treat as newly posted — use createdAt for the filter window
        {
          AND: [
            { sourceProvider: 'fantastic-jobs-db' },
            { createdAt: { gte: cutoff } },
            { originalPostedAt: { gte: slowSourceGapCutoff } },
          ],
        },
      ],
    });

    let cutoff: Date;
    switch (filters.postedWithin) {
      case '24h':
        cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '3d':
        cutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoff = new Date(0);
    }
    andConditions.push(buildPostedWithinCondition(cutoff));
  }

  // Location
  if (filters.location) {
    andConditions.push({
      OR: [
        { state: { equals: filters.location, mode: 'insensitive' } },
        { city: { contains: filters.location, mode: 'insensitive' } },
      ],
    });
  }

  // Specialty (keyword-based, OR within category)
  if (filters.specialty && filters.specialty.length > 0) {
    const specialtyConditions: Prisma.JobWhereInput[] = [];

    if (filters.specialty.includes('Telehealth')) {
      specialtyConditions.push({
        OR: [
          { title: { contains: 'telehealth', mode: 'insensitive' } },
          { title: { contains: 'telemedicine', mode: 'insensitive' } },
          { title: { contains: 'telepsychiatry', mode: 'insensitive' } },
          { description: { contains: 'telehealth', mode: 'insensitive' } },
          { description: { contains: 'telemedicine', mode: 'insensitive' } },
        ],
      });
    }
    if (filters.specialty.includes('Travel')) {
      specialtyConditions.push({
        OR: [
          { title: { contains: 'travel', mode: 'insensitive' } },
          { title: { contains: 'locum', mode: 'insensitive' } },
        ],
      });
    }

    if (specialtyConditions.length > 0) {
      andConditions.push({ OR: specialtyConditions });
    }
  }

  // Experience Level (from DB column)
  if (filters.experienceLevel && filters.experienceLevel.length > 0) {
    andConditions.push({
      experienceLevel: { in: filters.experienceLevel },
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}

// Parse URL search params to FilterState
export function parseFiltersFromParams(searchParams: URLSearchParams): FilterState {
  return {
    search: searchParams.get('q') || '',
    workMode: searchParams.getAll('workMode'),
    jobType: searchParams.getAll('jobType'),
    specialty: searchParams.getAll('specialty'),
    experienceLevel: searchParams.getAll('experienceLevel'),
    salaryMin: searchParams.get('salaryMin') ? Number(searchParams.get('salaryMin')) : null,
    postedWithin: searchParams.get('postedWithin') || null,
    location: searchParams.get('location') || null,
  };
}

// Convert FilterState to URL search params
export function filtersToParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.search) params.set('q', filters.search);
  filters.workMode.forEach((wm: string) => params.append('workMode', wm));
  filters.jobType.forEach((jt: string) => params.append('jobType', jt));
  if (filters.specialty) filters.specialty.forEach((s: string) => params.append('specialty', s));
  if (filters.experienceLevel) filters.experienceLevel.forEach((el: string) => params.append('experienceLevel', el));
  if (filters.salaryMin) params.set('salaryMin', String(filters.salaryMin));
  if (filters.postedWithin) params.set('postedWithin', filters.postedWithin);
  if (filters.location) params.set('location', filters.location);

  return params;
}

