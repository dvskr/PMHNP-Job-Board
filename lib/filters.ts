import { Prisma } from '@prisma/client';
import { FilterState } from '@/types/filters';

/**
 * Centralized Category Filter Registry
 * Single source of truth for all category page filters.
 * Used by both /jobs/[category]/page.tsx AND /jobs?category=[slug]
 */
export const CATEGORY_FILTERS: Record<string, Prisma.JobWhereInput[]> = {
  'child-adolescent': [
    { title: { contains: 'child and adolescent', mode: 'insensitive' } },
    { title: { contains: 'child/adolescent', mode: 'insensitive' } },
    { title: { contains: 'child psychiatr', mode: 'insensitive' } },
    { title: { contains: 'child & adolescent', mode: 'insensitive' } },
    { title: { contains: 'pediatric psych', mode: 'insensitive' } },
    { title: { contains: 'pediatric mental', mode: 'insensitive' } },
    { title: { contains: 'CAPMHNP', mode: 'insensitive' } },
    { title: { contains: 'adolescent psychiatr', mode: 'insensitive' } },
  ],
  'community-health': [
    { title: { contains: 'community', mode: 'insensitive' } },
    { title: { contains: 'FQHC', mode: 'insensitive' } },
    { title: { contains: 'public health', mode: 'insensitive' } },
  ],
  'correctional': [
    { title: { contains: 'correctional', mode: 'insensitive' } },
    { title: { contains: 'corrections', mode: 'insensitive' } },
    { title: { contains: 'prison', mode: 'insensitive' } },
    { title: { contains: 'forensic', mode: 'insensitive' } },
    { title: { contains: 'jail', mode: 'insensitive' } },
    { title: { contains: 'detention', mode: 'insensitive' } },
    { title: { contains: 'incarcerat', mode: 'insensitive' } },
  ],
  'new-grad': [
    { title: { contains: 'new grad', mode: 'insensitive' } },
    { title: { contains: 'new graduate', mode: 'insensitive' } },
    { title: { contains: 'entry level', mode: 'insensitive' } },
    { title: { contains: 'fellowship', mode: 'insensitive' } },
    { title: { contains: 'residency', mode: 'insensitive' } },
    { title: { contains: 'recent graduate', mode: 'insensitive' } },
    { title: { contains: 'training program', mode: 'insensitive' } },
  ],
  'outpatient': [
    { title: { contains: 'outpatient', mode: 'insensitive' } },
    { title: { contains: 'out-patient', mode: 'insensitive' } },
    { title: { contains: 'private practice', mode: 'insensitive' } },
    { title: { contains: 'community mental health', mode: 'insensitive' } },
  ],
  'substance-abuse': [
    { title: { contains: 'substance', mode: 'insensitive' } },
    { title: { contains: 'addiction', mode: 'insensitive' } },
    { title: { contains: 'suboxone', mode: 'insensitive' } },
    { title: { contains: 'dual diagnosis', mode: 'insensitive' } },
    { title: { contains: 'SUD ', mode: 'insensitive' } },
    { title: { contains: 'medication-assisted', mode: 'insensitive' } },
    { title: { contains: 'medication assisted treatment', mode: 'insensitive' } },
    { title: { contains: 'buprenorphine', mode: 'insensitive' } },
  ],
  'telehealth': [
    { title: { contains: 'telehealth', mode: 'insensitive' } },
    { title: { contains: 'telemedicine', mode: 'insensitive' } },
    { title: { contains: 'telepsychiatry', mode: 'insensitive' } },
    { title: { contains: 'virtual', mode: 'insensitive' } },
  ],
  'contract': [
    { title: { contains: 'contract', mode: 'insensitive' } },
    { title: { contains: 'temp-to-perm', mode: 'insensitive' } },
    { title: { contains: 'temporary', mode: 'insensitive' } },
  ],
  'crisis': [
    { title: { contains: 'crisis', mode: 'insensitive' } },
    { title: { contains: 'emergency psych', mode: 'insensitive' } },
    { title: { contains: 'acute stabilization', mode: 'insensitive' } },
    { title: { contains: 'urgent', mode: 'insensitive' } },
  ],
  'entry-level': [
    { title: { contains: 'entry level', mode: 'insensitive' } },
    { title: { contains: 'entry-level', mode: 'insensitive' } },
    { title: { contains: 'new grad', mode: 'insensitive' } },
    { title: { contains: 'new graduate', mode: 'insensitive' } },
  ],
  'full-time': [
    { title: { contains: 'full-time', mode: 'insensitive' } },
    { title: { contains: 'full time', mode: 'insensitive' } },
    { title: { contains: 'FT ', mode: 'insensitive' } },
    { title: { contains: 'permanent', mode: 'insensitive' } },
  ],
  'geriatric': [
    { title: { contains: 'geriatric', mode: 'insensitive' } },
    { title: { contains: 'geropsych', mode: 'insensitive' } },
    { title: { contains: 'elderly', mode: 'insensitive' } },
    { title: { contains: 'senior living', mode: 'insensitive' } },
    { title: { contains: 'nursing home', mode: 'insensitive' } },
  ],
  'hospital': [
    { title: { contains: 'hospital', mode: 'insensitive' } },
    { title: { contains: 'acute care', mode: 'insensitive' } },
    { title: { contains: 'acute psych', mode: 'insensitive' } },
  ],
  'lgbtq': [
    { title: { contains: 'LGBTQ', mode: 'insensitive' } },
    { title: { contains: 'transgender', mode: 'insensitive' } },
    { title: { contains: 'gender-affirming', mode: 'insensitive' } },
    { title: { contains: 'gender affirming', mode: 'insensitive' } },
    { title: { contains: 'gender identity', mode: 'insensitive' } },
    { title: { contains: 'affirming care', mode: 'insensitive' } },
  ],
  'locum-tenens': [
    { title: { contains: 'locum', mode: 'insensitive' } },
    { title: { contains: 'locums', mode: 'insensitive' } },
    { title: { contains: 'temporary assignment', mode: 'insensitive' } },
  ],
  'mid-career': [
    { title: { contains: 'experienced', mode: 'insensitive' } },
    { title: { contains: 'supervisor', mode: 'insensitive' } },
    { title: { contains: 'program director', mode: 'insensitive' } },
    { title: { contains: 'clinical director', mode: 'insensitive' } },
    { title: { contains: 'lead clinician', mode: 'insensitive' } },
    { title: { contains: 'lead PMHNP', mode: 'insensitive' } },
    { title: { contains: 'senior PMHNP', mode: 'insensitive' } },
    { title: { contains: 'senior NP', mode: 'insensitive' } },
    { title: { contains: 'senior nurse practitioner', mode: 'insensitive' } },
  ],
  'part-time': [
    { title: { contains: 'part-time', mode: 'insensitive' } },
    { title: { contains: 'part time', mode: 'insensitive' } },
    { title: { contains: 'PRN', mode: 'insensitive' } },
  ],
  'per-diem': [
    { title: { contains: 'per diem', mode: 'insensitive' } },
    { title: { contains: 'per-diem', mode: 'insensitive' } },
  ],
  'private-practice': [
    { title: { contains: 'private practice', mode: 'insensitive' } },
    { title: { contains: 'group practice', mode: 'insensitive' } },
    { title: { contains: 'solo practice', mode: 'insensitive' } },
    { title: { contains: 'independent practice', mode: 'insensitive' } },
  ],
  'senior': [
    // Title-based leadership keywords
    { title: { contains: 'senior PMHNP', mode: 'insensitive' } },
    { title: { contains: 'senior NP', mode: 'insensitive' } },
    { title: { contains: 'senior nurse practitioner', mode: 'insensitive' } },
    { title: { contains: 'lead PMHNP', mode: 'insensitive' } },
    { title: { contains: 'clinical lead', mode: 'insensitive' } },
    { title: { contains: 'clinical leader', mode: 'insensitive' } },
    { title: { contains: 'PMHNP supervisor', mode: 'insensitive' } },
    { title: { contains: 'NP supervisor', mode: 'insensitive' } },
    { title: { contains: 'nurse practitioner supervisor', mode: 'insensitive' } },
    { title: { contains: 'medical director', mode: 'insensitive' } },
    { title: { contains: 'clinical director', mode: 'insensitive' } },
    { title: { contains: 'program director', mode: 'insensitive' } },
    { title: { contains: 'chief of mental health', mode: 'insensitive' } },
    { title: { contains: 'clinic director', mode: 'insensitive' } },
    { title: { contains: 'director of psych', mode: 'insensitive' } },
    { title: { contains: 'PMHNP director', mode: 'insensitive' } },
    { title: { contains: 'vice president', mode: 'insensitive' } },
    { title: { contains: 'VP ', mode: 'insensitive' } },
    { title: { contains: 'experienced', mode: 'insensitive' } },
    // Description-based experience signals
    { description: { contains: 'years of experience', mode: 'insensitive' } },
    { description: { contains: 'experienced PMHNP', mode: 'insensitive' } },
    { description: { contains: 'experienced nurse practitioner', mode: 'insensitive' } },
    { description: { contains: 'seasoned', mode: 'insensitive' } },
    { description: { contains: '3+ years', mode: 'insensitive' } },
    { description: { contains: '5+ years', mode: 'insensitive' } },
    { description: { contains: '3-5 years', mode: 'insensitive' } },
    { description: { contains: '5-7 years', mode: 'insensitive' } },
    { description: { contains: '5-10 years', mode: 'insensitive' } },
    // Salary-based: above-average compensation = senior-level
    { normalizedMinSalary: { gte: 130000 } },
    { normalizedMaxSalary: { gte: 150000 } },
  ],
  'travel': [
    { title: { contains: 'travel', mode: 'insensitive' } },
    { title: { contains: 'locum', mode: 'insensitive' } },
    { title: { contains: 'traveling', mode: 'insensitive' } },
    { title: { contains: 'assignment', mode: 'insensitive' } },
  ],
  '1099': [
    { title: { contains: '1099', mode: 'insensitive' } },
    { title: { contains: 'independent contractor', mode: 'insensitive' } },
    { title: { contains: 'independent practice', mode: 'insensitive' } },
    { description: { contains: '1099', mode: 'insensitive' } },
  ],
  'addiction': [
    { title: { contains: 'addiction', mode: 'insensitive' } },
    { title: { contains: 'substance', mode: 'insensitive' } },
    { title: { contains: 'substance use', mode: 'insensitive' } },
    { title: { contains: ' SUD', mode: 'insensitive' } },
    { title: { contains: ' MAT ', mode: 'insensitive' } },
    { title: { contains: 'MAT program', mode: 'insensitive' } },
    { title: { contains: 'MAT &', mode: 'insensitive' } },
    { title: { contains: 'opioid', mode: 'insensitive' } },
    { title: { contains: 'detox', mode: 'insensitive' } },
    { title: { contains: 'recovery', mode: 'insensitive' } },
    { title: { contains: 'suboxone', mode: 'insensitive' } },
    { title: { contains: 'buprenorphine', mode: 'insensitive' } },
    { description: { contains: 'addiction', mode: 'insensitive' } },
    { description: { contains: 'substance use disorder', mode: 'insensitive' } },
    { description: { contains: 'MAT program', mode: 'insensitive' } },
  ],
  'behavioral-health': [
    { title: { contains: 'behavioral health', mode: 'insensitive' } },
    { title: { contains: 'behavioral', mode: 'insensitive' } },
    { title: { contains: 'mental health', mode: 'insensitive' } },
    { title: { contains: 'psychiatric', mode: 'insensitive' } },
    { title: { contains: 'psych NP', mode: 'insensitive' } },
    { title: { contains: 'PMHNP', mode: 'insensitive' } },
    { description: { contains: 'behavioral health', mode: 'insensitive' } },
    { description: { contains: 'behavioral health facility', mode: 'insensitive' } },
  ],
  'inpatient': [
    { title: { contains: 'inpatient', mode: 'insensitive' } },
    { title: { contains: 'in-patient', mode: 'insensitive' } },
    { title: { contains: 'acute care', mode: 'insensitive' } },
    { title: { contains: 'hospital', mode: 'insensitive' } },
  ],
  'va': [
    { employer: { contains: 'Veterans', mode: 'insensitive' } },
    { employer: { contains: 'VA ', mode: 'insensitive' } },
    { employer: { startsWith: 'VA ', mode: 'insensitive' } },
    { title: { contains: 'Veterans', mode: 'insensitive' } },
    { employer: { contains: 'Department of Veterans', mode: 'insensitive' } },
  ],
  'veterans': [
    { title: { contains: 'veteran', mode: 'insensitive' } },
    { title: { contains: 'VA ', mode: 'insensitive' } },
    { title: { contains: 'military', mode: 'insensitive' } },
    { title: { contains: 'VHA', mode: 'insensitive' } },
  ],
  'remote': [
    // Remote uses isRemote boolean, not title-based — see CATEGORY_SPECIAL_FILTERS
  ],
};

/**
 * Category Exclusion Registry
 * Negative filters to remove false positives from category results.
 * Each entry is a list of conditions — any matching job is EXCLUDED.
 */
export const CATEGORY_EXCLUSIONS: Record<string, Prisma.JobWhereInput[]> = {
  'new-grad': [
    { title: { contains: 'director', mode: 'insensitive' } },
    { title: { contains: 'instructor', mode: 'insensitive' } },
    { title: { contains: 'no new grad', mode: 'insensitive' } },
    { title: { contains: 'clinical psychology', mode: 'insensitive' } },
    { title: { contains: 'fellowship trained', mode: 'insensitive' } },
    { title: { contains: 'APC Fellowship', mode: 'insensitive' } },
    { title: { contains: 'Advanced Practice Provider', mode: 'insensitive' } },
  ],
  'senior': [
    // Exclude non-PMHNP leadership roles
    { title: { contains: 'Nursing Director', mode: 'insensitive' } },
    { title: { contains: 'HR Director', mode: 'insensitive' } },
    { title: { contains: 'IT Director', mode: 'insensitive' } },
    { title: { contains: 'Finance Director', mode: 'insensitive' } },
    { title: { contains: 'Rise Director', mode: 'insensitive' } },
    { title: { contains: 'Non-Supervisory', mode: 'insensitive' } },
    // Exclude pure psychiatrist roles (no NP/Nurse mention)
    {
      AND: [
        { title: { contains: 'Psychiatrist', mode: 'insensitive' } },
        { NOT: { title: { contains: 'Nurse', mode: 'insensitive' } } },
        { NOT: { title: { contains: 'PMHNP', mode: 'insensitive' } } },
        { NOT: { title: { contains: 'APRN', mode: 'insensitive' } } },
        { NOT: { title: { contains: 'NP', mode: 'insensitive' } } },
      ],
    },
  ],
  'outpatient': [
    // Exclude MD Psychiatrist roles that don't mention NP/Nurse/PMHNP/APRN
    {
      AND: [
        { title: { contains: 'Psychiatrist', mode: 'insensitive' } },
        { NOT: { title: { contains: 'Nurse', mode: 'insensitive' } } },
        { NOT: { title: { contains: 'Practitioner', mode: 'insensitive' } } },
        { NOT: { title: { contains: 'PMHNP', mode: 'insensitive' } } },
        { NOT: { title: { contains: 'APRN', mode: 'insensitive' } } },
        { NOT: { title: { contains: 'NP', mode: 'insensitive' } } },
      ],
    },
  ],
};

/**
 * Global Exclusions — applied to EVERY query site-wide.
 * Removes jobs that should never appear on a PMHNP job board.
 */
export const GLOBAL_EXCLUSIONS: Prisma.JobWhereInput[] = [
  // Exclude pure MD Psychiatrist roles (no NP/Nurse/PMHNP/APRN mention)
  {
    AND: [
      { title: { contains: 'Psychiatrist', mode: 'insensitive' } },
      { NOT: { title: { contains: 'Nurse', mode: 'insensitive' } } },
      { NOT: { title: { contains: 'Practitioner', mode: 'insensitive' } } },
      { NOT: { title: { contains: 'PMHNP', mode: 'insensitive' } } },
      { NOT: { title: { contains: 'APRN', mode: 'insensitive' } } },
      { NOT: { title: { contains: 'NP', mode: 'insensitive' } } },
    ],
  },
];

/**
 * Build a Prisma WHERE clause for a category page.
 * Applies: CATEGORY_FILTERS + CATEGORY_EXCLUSIONS + GLOBAL_EXCLUSIONS
 * This guarantees the same count the main /jobs?category=slug page shows.
 *
 * @param slug  Category slug (e.g. '1099', 'addiction')
 * @param extra Additional Prisma conditions merged at the top level
 *              (e.g. { isRemote: { not: true } } for inpatient)
 */
export function buildCategoryWhereClause(
  slug: string,
  extra: Prisma.JobWhereInput = {},
): Prisma.JobWhereInput {
  const andConditions: Prisma.JobWhereInput[] = [];

  // Category filter (OR conditions from registry)
  if (CATEGORY_FILTERS[slug]?.length) {
    andConditions.push({ OR: CATEGORY_FILTERS[slug] });
  }

  // Category-specific exclusions
  if (CATEGORY_EXCLUSIONS[slug]) {
    CATEGORY_EXCLUSIONS[slug].forEach(exclusion => {
      andConditions.push({ NOT: exclusion });
    });
  }

  // Global exclusions (removes non-PMHNP jobs)
  GLOBAL_EXCLUSIONS.forEach(exclusion => {
    andConditions.push({ NOT: exclusion });
  });

  return {
    isPublished: true,
    ...extra,
    AND: andConditions,
  };
}

export function buildWhereClause(filters: FilterState): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = {
    isPublished: true,
  };

  const andConditions: Prisma.JobWhereInput[] = [];

  // Apply global exclusions (removes non-PMHNP jobs from all queries)
  GLOBAL_EXCLUSIONS.forEach(exclusion => {
    andConditions.push({ NOT: exclusion });
  });

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

  // Category filter (enterprise pattern: reuses same filter as category pages)
  if (filters.category && CATEGORY_FILTERS[filters.category]) {
    andConditions.push({
      OR: CATEGORY_FILTERS[filters.category],
    });
    // Apply exclusions to remove false positives
    if (CATEGORY_EXCLUSIONS[filters.category]) {
      CATEGORY_EXCLUSIONS[filters.category].forEach(exclusion => {
        andConditions.push({ NOT: exclusion });
      });
    }
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

  // Posted Within — uses createdAt (when the job appeared on PMHNPHiring.com)
  // for all sources. This ensures newly ingested jobs always show under the
  // correct time window regardless of the source site's original post date.
  if (filters.postedWithin && filters.postedWithin !== 'all') {
    const now = new Date();

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

  // Precise city + state match (from metro/city page CTAs)
  if (filters.cityExact) {
    andConditions.push({
      city: { equals: filters.cityExact, mode: 'insensitive' },
    });
  }
  if (filters.stateCode) {
    andConditions.push({
      OR: [
        { stateCode: { equals: filters.stateCode, mode: 'insensitive' } },
        { state: { equals: filters.stateCode, mode: 'insensitive' } },
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

  // Employer
  if (filters.employer) {
    andConditions.push({
      employer: { equals: filters.employer, mode: 'insensitive' },
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
    cityExact: searchParams.get('cityExact') || null,
    stateCode: searchParams.get('stateCode') || null,
    employer: searchParams.get('employer') || null,
    category: searchParams.get('category') || null,
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
  if (filters.cityExact) params.set('cityExact', filters.cityExact);
  if (filters.stateCode) params.set('stateCode', filters.stateCode);
  if (filters.employer) params.set('employer', filters.employer);
  if (filters.category) params.set('category', filters.category);

  return params;
}

