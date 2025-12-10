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

  for (const query of SEARCH_QUERIES) {
    try {
      console.log(`[CareerJet] Searching for: "${query}"`);
      
      // Fetch up to 3 pages (50 jobs per page)
      for (let page = 1; page <= 3; page++) {
        try {
          const params = new URLSearchParams({
            locale_code: 'en_US',
            keywords: query,
            location: 'United States',
            affid: affiliateId,
            page: page.toString(),
            pagesize: '50',
            sort: 'date',
          });

          const response = await fetch(`https://public.api.careerjet.net/search?${params}`);
          
          if (!response.ok) {
            console.error(`[CareerJet] HTTP error ${response.status} for page ${page}`);
            break;
          }

          const data = await response.json() as CareerJetResponse;

          if (data.type === 'ERROR') {
            console.error(`[CareerJet] API returned error for "${query}" page ${page}`);
            break;
          }

          const jobs = data.jobs || [];
          console.log(`[CareerJet] Page ${page}: ${jobs.length} jobs`);

          if (jobs.length === 0) {
            break;
          }

          // Process each job
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

        } catch (error) {
          console.error(`[CareerJet] Error fetching page ${page} for "${query}":`, error);
          break;
        }
      }

      // Delay between different queries
      await sleep(1500);

    } catch (error) {
      console.error(`[CareerJet] Error processing query "${query}":`, error);
      // Continue to next query
    }
  }

  console.log(`[CareerJet] Total unique jobs fetched: ${allJobs.length}`);
  
  return allJobs;
}

