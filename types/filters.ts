export interface FilterState {
  search: string;
  workMode: string[];      // ['remote', 'hybrid', 'onsite']
  jobType: string[];       // ['Full-Time', 'Part-Time', 'Contract', 'Per Diem']
  salaryMin: number | null;
  postedWithin: string | null;  // '24h', '7d', '30d', 'all'
  location: string | null;
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
  };
  salary: {
    any: number;
    over100k: number;
    over150k: number;
    over200k: number;
  };
  postedWithin: {
    '24h': number;
    '7d': number;
    '30d': number;
  };
  total: number;
}

export const DEFAULT_FILTERS: FilterState = {
  search: '',
  workMode: [],
  jobType: [],
  salaryMin: null,
  postedWithin: null,
  location: null,
};

