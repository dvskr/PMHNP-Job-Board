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
  redirect_url: string;
  created: string;
}

interface AdzunaResponse {
  results: AdzunaJob[];
  count: number;
}

// Multiple search queries for maximum coverage
const SEARCH_QUERIES = [
  'PMHNP',
  'Psychiatric Nurse Practitioner',
  'Psychiatric Mental Health Nurse Practitioner',
  'Psych NP',
  'Mental Health Nurse Practitioner',
  'Psychiatric APRN',
  'Behavioral Health Nurse Practitioner',
];

// Helper function for delays
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

  const allJobs: Array<Record<string, unknown>> = [];
  const seenIds = new Set<string>();

  console.log(`[Adzuna] Starting fetch with ${SEARCH_QUERIES.length} search queries...`);

  for (const query of SEARCH_QUERIES) {
    // Fetch up to 5 pages per query (50 results per page = 250 max per query)
    for (let page = 1; page <= 5; page++) {
      try {
        const params = new URLSearchParams({
          app_id: appId,
          app_key: appKey,
          what: query,
          results_per_page: '50',
          max_days_old: '30',
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

              // Skip jobs without a valid apply link
              if (!job.redirect_url) {
                console.log(`[Adzuna] Skipping job "${job.title}" - missing redirect_url`);
                continue;
              }

              allJobs.push({
                title: job.title,
                employer: job.company?.display_name || 'Company Not Listed',
                location: job.location?.display_name || 'United States',
                description: job.description || '',
                minSalary: job.salary_min || null,
                maxSalary: job.salary_max || null,
                salaryPeriod: job.salary_min ? 'annual' : null,
                applyLink: job.redirect_url,
                externalId: `adzuna_${job.id}`,
                sourceProvider: 'adzuna',
                postedAt: job.created,
              });
        }

        // Rate limiting - 500ms between requests
        await sleep(500);

        // If we got fewer than 50 results, no more pages
        if (jobs.length < 50) {
          break;
        }

      } catch (error) {
        console.error(`[Adzuna] Error fetching "${query}" page ${page}:`, error);
        break; // Move to next query on error
      }
    }

    // Small delay between different queries
    await sleep(300);
  }

  console.log(`[Adzuna] ✅ Total unique jobs fetched: ${allJobs.length}`);
  return allJobs;
}
