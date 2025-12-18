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
    andConditions.push({
      jobType: { in: filters.jobType },
    });
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
    let cutoff: Date;
    
    switch (filters.postedWithin) {
      case '24h':
        cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
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
    
    // Note: Using createdAt field (Job model doesn't have postedAt)
    andConditions.push({ createdAt: { gte: cutoff } });
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
  if (filters.salaryMin) params.set('salaryMin', String(filters.salaryMin));
  if (filters.postedWithin) params.set('postedWithin', filters.postedWithin);
  if (filters.location) params.set('location', filters.location);
  
  return params;
}

