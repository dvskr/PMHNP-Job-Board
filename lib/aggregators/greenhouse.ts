import { GREENHOUSE_SLUGS as GREENHOUSE_COMPANIES, GREENHOUSE_NAMES as COMPANY_NAMES } from './tenants/greenhouse';

interface GreenhouseJob {
  id: number;
  title: string;
  updated_at: string;
  requisition_id: string;
  location: {
    name: string;
  };
  absolute_url: string;
  internal_job_id: number;
  metadata: Array<Record<string, unknown>>;
  departments: Array<{
    id: number;
    name: string;
  }>;
  offices: Array<{
    id: number;
    name: string;
    location: string;
  }>;
  content: string;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
  meta: {
    total: number;
  };
}

export interface GreenhouseJobRaw {
  externalId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  applyLink: string;
  postedDate?: string;
}

function formatCompanyName(slug: string): string {

  return COMPANY_NAMES[slug] || slug
    .split(/[-_]/)
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function isPMHNPJob(_title: string, _content: string): boolean {
  return true; // All jobs pass through — central filter in ingestFromSource handles rejection tracking
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCompanyJobs(companySlug: string): Promise<GreenhouseJobRaw[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${companySlug}/jobs?content=true`;
  const companyName = formatCompanyName(companySlug);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[Greenhouse] ${companySlug}: API error ${response.status}`);
      return [];
    }

    const data: GreenhouseResponse = await response.json();
    const jobs = data.jobs || [];
    const totalJobs = jobs.length;

    console.log(`[Greenhouse] ${companySlug}: ${totalJobs} jobs fetched`);

    const allJobs = jobs.map((job: GreenhouseJob) => ({
      externalId: `greenhouse-${companySlug}-${job.id}`,
      title: job.title,
      company: companyName,
      location: job.location?.name || job.offices?.[0]?.name || 'Remote',
      description: job.content || '',
      applyLink: job.absolute_url,
      // Greenhouse only exposes updated_at (last-edit date). Pre-2026-05-05
      // we omitted it so originalPostedAt defaulted to ingest time — but that
      // broke the new 60-day-from-original lifecycle cap (every greenhouse
      // job appeared fresh forever). Now we DO use updated_at: an old listing
      // that hasn't been edited will have an old date and correctly age out;
      // an old listing that just got edited will look fresh for 60 more days,
      // which is acceptable since edit-activity is a real signal of the
      // employer still hiring.
      postedDate: job.updated_at,
    }));

    // Pre-filter for PMHNP relevance
    const relevantJobs = allJobs.filter(job => isPMHNPJob(job.title, job.description));
    console.log(`[Greenhouse] ${companySlug}: ${relevantJobs.length}/${totalJobs} jobs relevant`);

    return relevantJobs;
  } catch (error) {
    console.error(`[Greenhouse] ${companySlug}: Error -`, error);
    return [];
  }
}

/**
 * Total number of chunks for Greenhouse. Reduced from 8 → 4 on
 * 2026-05-05 after trimming the tenant list from 63 → 50 producers.
 * With ~12-13 boards per chunk and the tenant list reading from a
 * config file, 4 chunks complete comfortably inside the 240s budget.
 *
 * MUST match the number of /api/cron/ingest?source=greenhouse&chunk=N
 * entries in vercel.json — see tests/aggregators/chunk-count.test.ts.
 */
export const GREENHOUSE_TOTAL_CHUNKS = 4;
const GREENHOUSE_CHUNK_SIZE = Math.ceil(GREENHOUSE_COMPANIES.length / GREENHOUSE_TOTAL_CHUNKS);

export async function fetchGreenhouseJobs(options?: { chunk?: number }): Promise<GreenhouseJobRaw[]> {
  let companies = GREENHOUSE_COMPANIES;

  if (options?.chunk !== undefined) {
    const start = options.chunk * GREENHOUSE_CHUNK_SIZE;
    const end = start + GREENHOUSE_CHUNK_SIZE;
    companies = GREENHOUSE_COMPANIES.slice(start, end);
    console.log(`[Greenhouse] Chunk ${options.chunk}/${GREENHOUSE_TOTAL_CHUNKS - 1}: Processing companies ${start + 1}-${Math.min(end, GREENHOUSE_COMPANIES.length)} of ${GREENHOUSE_COMPANIES.length}`);
  } else {
    console.log(`[Greenhouse] Checking ${GREENHOUSE_COMPANIES.length} companies for PMHNP jobs...`);
  }

  const allJobs: GreenhouseJobRaw[] = [];
  const failedCompanies: string[] = [];
  const BATCH_SIZE = 10;

  try {
    for (let i = 0; i < companies.length; i += BATCH_SIZE) {
      const batch = companies.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(companySlug => fetchCompanyJobs(companySlug))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === 'fulfilled') {
          allJobs.push(...result.value);
        } else {
          failedCompanies.push(batch[j]);
          console.error(`[Greenhouse] Failed to fetch from ${batch[j]}`);
        }
      }

      // Small delay between batches
      if (i + BATCH_SIZE < companies.length) {
        await sleep(200);
      }
    }

    console.log(`[Greenhouse] Total PMHNP jobs fetched: ${allJobs.length}`);

    if (failedCompanies.length > 0) {
      console.log(`[Greenhouse] Failed companies (${failedCompanies.length}): ${failedCompanies.join(', ')}`);
    }

    return allJobs;
  } catch (error) {
    console.error('[Greenhouse] Error in main fetch:', error);
    return allJobs;
  }
}

import type { Aggregator, RawJobData, FetchOptions } from './types';
import { checkJobHealth, type HealthDecision } from '@/lib/health/check-job-health';

export const greenhouseAggregator: Aggregator = {
    key: 'greenhouse',
    chunkCount: GREENHOUSE_TOTAL_CHUNKS,
    async fetch(opts: FetchOptions = {}): Promise<RawJobData[]> {
        return (await fetchGreenhouseJobs({ chunk: opts.chunk })) as unknown as RawJobData[];
    },
    async probeJob(externalId: string, applyLink: string): Promise<HealthDecision | null> {
        // Routes through checkJobHealth, which dispatches to the
        // Greenhouse JSON API probe (lib/health/probes/greenhouse-api.ts).
        return checkJobHealth(applyLink, 'greenhouse', { externalId });
    },
};
