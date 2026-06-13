export interface FilterState {
  search: string;
  workMode: string[];      // ['remote', 'hybrid', 'onsite']
  jobType: string[];       // ['Full-Time', 'Part-Time', 'Contract', 'Per Diem']
  specialty: string[];     // ['Telehealth', 'Travel']
  experienceLevel: string[]; // ['New Grad', 'Mid-Level', 'Senior'] — LEGACY (frozen 2026-05-13)
  // Phase 1 structured experience filters (lib/experience-label.ts).
  // newGradFriendly = true   → only jobs flagged "open to new grads"
  // newGradFriendly = null   → any
  // minYearsExperience = N   → only jobs whose minYearsExperience ≤ N (i.e. the
  //                            candidate has ≥ N years and qualifies)
  newGradFriendly: boolean | null;
  minYearsExperience: number | null;
  salaryMin: number | null;
  postedWithin: string | null;  // '24h', '3d', '7d', '30d', 'all'
  location: string | null;
  cityExact: string | null;   // exact city match (e.g. 'New York')
  stateCode: string | null;   // 2-letter state code (e.g. 'NY')
  employer: string | null;  // filter by employer name
  category: string | null;  // category slug for pre-defined filters (e.g. 'child-adolescent')
}

export interface FilterCounts {
  workMode: {
    remote: number;
    hybrid: number;
    onsite: number;
  };
  jobType: {
    'Full-Time': number;
    'Part-Time': number;
    'Contract': number;
    'Per Diem': number;
    'Other': number;
  };
  salary: {
    any: number;
    over100k: number;
    over150k: number;
    over200k: number;
  };
  postedWithin: {
    '24h': number;
    '3d': number;
    '7d': number;
    '30d': number;
  };
  specialty: {
    Telehealth: number;
    Travel: number;
  };
  experienceLevel: {
    'New Grad': number;
    'Mid-Level': number;
    'Senior': number;
  };
  // Structured experience counts. `newGradFriendly` is the total count of jobs
  // flagged open to new grads (its own filter section). `minYears` keys are the
  // candidate "Your experience" buckets — collapsed to {1,2,5}; the 7+/10+
  // buckets were dropped as provably-identical-to-5+ dead options.
  newGradFriendly: number;
  minYears: {
    1: number;
    2: number;
    5: number;
  };
  total: number;
}

export const DEFAULT_FILTERS: FilterState = {
  search: '',
  workMode: [],
  jobType: [],
  specialty: [],
  experienceLevel: [],
  newGradFriendly: null,
  minYearsExperience: null,
  salaryMin: null,
  postedWithin: null,
  location: null,
  cityExact: null,
  stateCode: null,
  employer: null,
  category: null,
};

