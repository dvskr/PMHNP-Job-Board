export interface FilterState {
  search: string;
  workMode: string[];      // ['remote', 'hybrid', 'onsite']
  jobType: string[];       // ['Full-Time', 'Part-Time', 'Contract', 'Per Diem']
  specialty: string[];     // ['Telehealth', 'Travel', 'New Grad']
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
    '7d': number;
    '30d': number;
  };
  specialty: {
    Telehealth: number;
    Travel: number;
    'New Grad': number;
  };
  total: number;
}

export const DEFAULT_FILTERS: FilterState = {
  search: '',
  workMode: [],
  jobType: [],
  specialty: [],
  salaryMin: null,
  postedWithin: null,
  location: null,
};

