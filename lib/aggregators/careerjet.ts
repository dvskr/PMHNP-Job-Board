// CareerJet API aggregator for PMHNP jobs

interface CareerJetJob {
  title: string;
  description: string;
  company: string;
  locations: string;
  date: string;
  salary: string;
  url: string;
  site: string;
}

interface CareerJetResponse {
  type: string;
  hits: number;
  pages: number;
  jobs: CareerJetJob[];
}

// CareerJet public search endpoint (no auth required, just affiliate ID)
const API_ENDPOINT = 'https://public.api.careerjet.net/search';

const SEARCH_QUERIES = [
  'PMHNP',
  'Psychiatric Nurse Practitioner',
  'Mental Health Nurse Practitioner',
];

/**
 * Helper function to check if job title is relevant
 */
function isRelevantJob(title: string): boolean {
  const lower = title.toLowerCase();
  const keywords = [
    'pmhnp',
    'psychiatric nurse',
    'psych np',
    'mental health nurse practitioner',
    'psychiatric mental health',
    'psych mental health',
    'psychiatric aprn',
  ];
  return keywords.some(kw => lower.includes(kw));
}

/**
 * Helper function to create a hash from a string
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Helper function to add delay between requests
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout (simple, no auth)
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'PMHNP-Job-Board/1.0 (contact@pmhnphiring.com)',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Fetch from CareerJet API with retry logic
 */
async function fetchFromCareerJetWithRetry(
  params: URLSearchParams,
  maxRetries: number = 1
): Promise<CareerJetResponse | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const url = `${API_ENDPOINT}?${params}`;

      const response = await fetchWithTimeout(url, 15000);

      if (!response.ok) {
        console.error(`[CareerJet] HTTP error ${response.status}`);
        if (attempt < maxRetries) {
          await sleep(1000);
          continue;
        }
        return null;
      }

      const data = await response.json() as CareerJetResponse;

      if (data.type === 'ERROR') {
        console.error(`[CareerJet] API returned error`);
        return null;
      }

      return data;

    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`[CareerJet] Request failed (${errorMsg})`);

      if (attempt < maxRetries) {
        await sleep(1000);
      }
    }
  }

  return null;
}

/**
 * Fetches PMHNP jobs from CareerJet API
 * @returns Array of normalized job objects
 */
export async function fetchCareerJetJobs(): Promise<Array<Record<string, unknown>>> {
  const affiliateId = process.env.CAREERJET_AFFILIATE_ID;

  if (!affiliateId) {
    console.error('[CareerJet] Affiliate ID not set in environment variables');
    return [];
  }

  const allJobs: Array<Record<string, unknown>> = [];
  const seenUrls = new Set<string>();

  console.log('[CareerJet] Starting job fetch...');

  for (const query of SEARCH_QUERIES) {
    try {
      console.log(`[CareerJet] Searching for: "${query}"`);

      // Fetch up to 3 pages (50 jobs per page)
      for (let page = 1; page <= 3; page++) {
        const params = new URLSearchParams({
          locale_code: 'en_US',
          keywords: query,
          location: 'United States',
          affid: affiliateId,
          page: page.toString(),
          pagesize: '50',
          sort: 'date',
          user_ip: process.env.CAREERJET_USER_IP || '127.0.0.1',
          user_agent: 'PMHNP-Job-Board/1.0 (contact@pmhnphiring.com)',
        });

        const data = await fetchFromCareerJetWithRetry(params);


        if (!data) {
          console.warn(`[CareerJet] Request failed for "${query}" page ${page}`);
          break;
        }

        const jobs = data.jobs || [];
        console.log(`[CareerJet] Page ${page}: ${jobs.length} jobs`);

        if (jobs.length === 0) {
          break;
        }

        // Process each job
        // Track jobs added per page (currently unused)
        for (const job of jobs) {
          // Skip if already seen
          if (seenUrls.has(job.url)) {
            continue;
          }

          // Skip if not relevant
          if (!isRelevantJob(job.title)) {
            continue;
          }

          seenUrls.add(job.url);

          allJobs.push({
            title: job.title,
            employer: job.company || 'Company Not Listed',
            location: job.locations || 'United States',
            description: job.description || '',
            salary: job.salary || null,
            applyLink: job.url,
            externalId: `careerjet_${hashString(job.url)}`,
            sourceProvider: 'careerjet',
            postedDate: job.date,
            sourceSite: job.site,
          });
        }

        // Rate limiting: wait 1500ms between page requests
        if (page < 3 && page < data.pages) {
          await sleep(1500);
        }

        // Stop if we've reached the last page
        if (page >= data.pages) {
          break;
        }
      }

      // Delay between different queries
      await sleep(1500);

    } catch (error) {
      console.error(`[CareerJet] Error processing query "${query}":`, error);
    }
  }

  console.log(`[CareerJet] Total unique jobs fetched: ${allJobs.length}`);

  return allJobs;
}

