interface AdzunaJob {
  id: string;
  title: string;
  company: {
    display_name: string;
  };
  location: {
    display_name: string;
  };
  description: string;
  salary_min?: number;
  salary_max?: number;
  contract_time?: string; // e.g., "full_time", "part_time"
  contract_type?: string; // e.g., "permanent", "contract"
  redirect_url: string;
  created: string;
}

interface AdzunaResponse {
  results: AdzunaJob[];
  count: number;
}

import { ADZUNA_SEARCH_QUERIES as SEARCH_QUERIES } from './search-terms/adzuna';
import { RateLimiter } from './types';

// Adzuna's published rate limit is generous (no documented per-second
// cap), but a 500ms gap between requests has been our healthy operating
// point — fast enough to finish 22 terms × 20 pages within the 240s
// budget, slow enough to never hit a soft 429.
const ADZUNA_PAGE_RATE_LIMIT_MS = 500;
const ADZUNA_QUERY_GAP_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchAdzunaJobs(): Promise<Array<Record<string, unknown>>> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    console.error('[Adzuna] API credentials not configured');
    return [];
  }

  const ADZUNA_TIME_BUDGET_MS = 250_000; // 250s budget (Vercel cron limit: 300s)
  const startTime = Date.now();

  const allJobs: Array<Record<string, unknown>> = [];
  const seenIds = new Set<string>();
  const pageRateLimiter = new RateLimiter(ADZUNA_PAGE_RATE_LIMIT_MS);

  // VALIDATION STATS
  let totalRawJobs = 0;

  console.log(`[Adzuna] Starting fetch with ${SEARCH_QUERIES.length} search queries...`);

  for (const query of SEARCH_QUERIES) {
    // Time budget check
    const elapsed = Date.now() - startTime;
    if (elapsed >= ADZUNA_TIME_BUDGET_MS) {
      console.warn(`[Adzuna] Time budget exhausted (${(elapsed / 1000).toFixed(1)}s). Returning ${allJobs.length} jobs collected so far.`);
      break;
    }

    // Fetch up to 20 pages per query (50 results per page = 1000 max per query)
    for (let page = 1; page <= 20; page++) {
      try {
        const params = new URLSearchParams({
          app_id: appId,
          app_key: appKey,
          what: query,
          results_per_page: '50',
          max_days_old: '7', // Production: 7-day lookback (cron runs 2x/day)
          sort_by: 'date',
        });

        const url = `https://api.adzuna.com/v1/api/jobs/us/search/${page}?${params.toString()}`;
        const response = await fetch(url);

        if (!response.ok) {
          console.error(`[Adzuna] HTTP ${response.status} for "${query}" page ${page}`);
          break; // Move to next query
        }

        const data: AdzunaResponse = await response.json();
        const jobs = data.results || [];

        console.log(`[Adzuna] "${query}" page ${page}: ${jobs.length} jobs (total available: ${data.count})`);

        // Debug: Log first job structure on first page of first query
        if (query === SEARCH_QUERIES[0] && page === 1 && jobs.length > 0) {
          console.log('[Adzuna] Sample job structure:', JSON.stringify(jobs[0], null, 2));
        }

        if (jobs.length === 0) {
          break; // No more results for this query
        }

        for (const job of jobs) {
          // Skip duplicates
          if (seenIds.has(job.id)) continue;
          seenIds.add(job.id);

          totalRawJobs++;

          // Skip jobs without a valid apply link
          if (!job.redirect_url) {
            continue;
          }

          // Map Adzuna contract types
          let jobType = null;
          if (job.contract_time === 'full_time') jobType = 'Full-Time';
          else if (job.contract_time === 'part_time') jobType = 'Part-Time';
          else if (job.contract_type === 'contract') jobType = 'Contract';
          else if (job.contract_type === 'permanent') jobType = 'Full-Time';

          allJobs.push({
            title: job.title,
            employer: job.company?.display_name || 'Company Not Listed',
            location: job.location?.display_name || 'United States',
            description: job.description || '',
            minSalary: job.salary_min || null,
            maxSalary: job.salary_max || null,
            salaryPeriod: job.salary_min ? 'annual' : null,
            jobType, // Pass raw mapped type
            applyLink: job.redirect_url,
            externalId: `adzuna_${job.id}`,
            sourceProvider: 'adzuna',
            postedAt: job.created,
          });
        }

        // Rate-limit the next page request via shared RateLimiter.
        await pageRateLimiter.throttle();

        // If we got fewer than 50 results, no more pages
        if (jobs.length < 50) {
          break;
        }

      } catch (error) {
        console.error(`[Adzuna] Error fetching "${query}" page ${page}:`, error);
        break; // Move to next query on error
      }
    }

    // Small gap between different search terms.
    await sleep(ADZUNA_QUERY_GAP_MS);
  }

  console.log(`[Adzuna] VALIDATION STATS:`);
  console.log(`    Total Raw Jobs Fetched: ${totalRawJobs}`);
  console.log(`    Final Passed to Pipeline: ${allJobs.length}`);

  return allJobs;
}

import type { Aggregator, RawJobData } from './types';
import { checkJobHealth, type HealthDecision } from '@/lib/health/check-job-health';

export const adzunaAggregator: Aggregator = {
    key: 'adzuna',
    chunkCount: 1,
    async fetch(): Promise<RawJobData[]> {
        return (await fetchAdzunaJobs()) as unknown as RawJobData[];
    },
    async probeJob(externalId: string, applyLink: string): Promise<HealthDecision | null> {
        return checkJobHealth(applyLink, 'adzuna', { externalId });
    },
};
