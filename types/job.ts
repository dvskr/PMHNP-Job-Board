import { Job } from '@prisma/client';

export type { Job };

export interface JobFilters {
  search?: string;
  location?: string;
  jobType?: string;
  mode?: string;
  minSalary?: number;
  maxSalary?: number;
}

export interface JobListResponse {
  jobs: Job[];
  total: number;
}

