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

// Try multiple API endpoints (different regions/domains)
const API_ENDPOINTS = [
  'https://public.api.careerjet.net/search',
  'https://api.careerjet.com/search',
  'https://www.careerjet.com/api/search',
];

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
 * Fetch with timeout
 */
async function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PMHNP-JobBoard/1.0)',
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Try fetching from multiple API endpoints with retry logic
 */
async function fetchFromCareerJetWithRetry(
  params: URLSearchParams,
  maxRetries: number = 2
): Promise<CareerJetResponse | null> {
  for (const endpoint of API_ENDPOINTS) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const url = `${endpoint}?${params}`;
        console.log(`[CareerJet] Trying ${endpoint} (attempt ${attempt + 1}/${maxRetries + 1})`);
        
        const response = await fetchWithTimeout(url, 10000);
        
        if (!response.ok) {
          if (response.status === 429) {
            console.log(`[CareerJet] Rate limited, waiting...`);
            await sleep(5000);
            continue;
          }
          if (response.status >= 500) {
            console.log(`[CareerJet] Server error ${response.status}, trying next...`);
            continue;
          }
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json() as CareerJetResponse;
        
        if (data.type === 'ERROR') {
          console.error(`[CareerJet] API error response from ${endpoint}`);
          continue;
        }
        
        console.log(`[CareerJet] ✓ Success with ${endpoint}`);
        return data;
        
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        console.log(`[CareerJet] ${endpoint} failed (${errorMsg})`);
        
        if (attempt < maxRetries) {
          const backoffMs = 1000 * Math.pow(2, attempt);
          console.log(`[CareerJet] Retrying in ${backoffMs}ms...`);
          await sleep(backoffMs);
        }
      }
    }
  }
  
  return null;
}

/**
 * Fetches PMHNP jobs from CareerJet API
 * @returns Array of normalized job objects
 */
export async function fetchCareerJetJobs(): Promise<any[]> {
  const affiliateId = process.env.CAREERJET_AFFILIATE_ID;
  
  if (!affiliateId) {
    console.error('[CareerJet] Affiliate ID not set in environment variables');
    return [];
  }

  const allJobs: any[] = [];
  const seenUrls = new Set<string>();

  console.log('[CareerJet] Starting job fetch with enhanced retry logic...');
  let successfulRequests = 0;
  let failedRequests = 0;

  for (const query of SEARCH_QUERIES) {
    try {
      console.log(`[CareerJet] Searching for: "${query}"`);
      
      // Fetch up to 2 pages (50 jobs per page) - reduced to minimize failures
      for (let page = 1; page <= 2; page++) {
        const params = new URLSearchParams({
          locale_code: 'en_US',
          keywords: query,
          location: 'United States',
          affid: affiliateId,
          page: page.toString(),
          pagesize: '50',
          sort: 'date',
          user_ip: '8.8.8.8', // Add user IP as some APIs require it
          user_agent: 'Mozilla/5.0',
        });

        const data = await fetchFromCareerJetWithRetry(params);
        
        if (!data) {
          console.warn(`[CareerJet] All endpoints failed for "${query}" page ${page}`);
          failedRequests++;
          break; // Move to next query
        }
        
        successfulRequests++;
        
        const jobs = data.jobs || [];
        console.log(`[CareerJet] ✓ Page ${page}: ${jobs.length} jobs (${data.hits} total available)`);

        if (jobs.length === 0) {
          break;
        }

        // Process each job
        let addedFromPage = 0;
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
          addedFromPage++;

          allJobs.push({
            title: job.title,
            company: job.company || 'Company Not Listed',
            location: job.locations || 'United States',
            description: job.description || '',
            salary: job.salary || null,
            url: job.url,
            id: `careerjet_${hashString(job.url)}`,
            sourceProvider: 'careerjet',
            postedDate: job.date,
            sourceSite: job.site,
          });
        }
        
        console.log(`[CareerJet] Added ${addedFromPage} relevant jobs from page ${page}`);

        // Rate limiting: wait between page requests
        if (page < 2 && page < data.pages) {
          await sleep(2000);
        }

        // Stop if we've reached the last page
        if (page >= data.pages) {
          break;
        }
      }

      // Delay between different queries
      await sleep(2000);

    } catch (error) {
      console.error(`[CareerJet] Fatal error processing query "${query}":`, error);
      failedRequests++;
      // Continue to next query
    }
  }

  console.log(`[CareerJet] Fetch complete: ${successfulRequests} successful, ${failedRequests} failed`);
  console.log(`[CareerJet] Total unique jobs fetched: ${allJobs.length}`);

  console.log(`[CareerJet] Total unique jobs fetched: ${allJobs.length}`);
  
  return allJobs;
}

