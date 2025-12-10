// Jooble API aggregator for PMHNP jobs

interface JoobleJob {
  title: string;
  location: string;
  snippet: string;
  salary: string;
  source: string;
  type: string;
  link: string;
  company: string;
  updated: string;
  id: string;
}

interface JoobleResponse {
  totalCount: number;
  jobs: JoobleJob[];
}

const SEARCH_KEYWORDS = [
  'PMHNP',
  'Psychiatric Mental Health Nurse Practitioner',
  'Psychiatric Nurse Practitioner',
  'Psych NP',
  'Mental Health NP',
  'Psychiatric APRN',
];

/**
 * Helper function to clean up job snippet/description
 */
function cleanSnippet(snippet: string): string {
  if (!snippet) return '';
  
  let cleaned = snippet.trim();
  
  // Remove ALL ellipsis markers (leading, trailing, and middle)
  // Replace ... with a space to avoid word concatenation
  cleaned = cleaned.replace(/\.{2,}/g, ' ');
  
  // Remove common snippet artifacts
  cleaned = cleaned.replace(/^Description Summary:\s*/i, '');
  cleaned = cleaned.replace(/^About (this|the) (role|position|job):\s*/i, '');
  
  // Clean up multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  // Remove leading/trailing whitespace
  cleaned = cleaned.trim();
  
  // Add proper ending if it doesn't have punctuation
  if (cleaned && !cleaned.match(/[.!?]$/)) {
    cleaned += '.';
  }
  
  return cleaned;
}

/**
 * Helper function to add delay between requests
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches PMHNP jobs from Jooble API
 * @returns Array of normalized job objects
 */
export async function fetchJoobleJobs(): Promise<any[]> {
  const apiKey = process.env.JOOBLE_API_KEY;
  
  if (!apiKey) {
    console.error('[Jooble] API key not set in environment variables');
    return [];
  }

  const allJobs: any[] = [];
  const seenIds = new Set<string>();

  for (const keyword of SEARCH_KEYWORDS) {
    try {
      const response = await fetch(`https://jooble.org/api/${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keywords: keyword,
          location: 'United States',
          page: 1,
        }),
      });

      const data = await response.json() as JoobleResponse;
      const { totalCount, jobs } = data;

      console.log(`[Jooble] Found ${totalCount} for '${keyword}', returned ${jobs.length}`);

      for (const job of jobs) {
        if (!seenIds.has(job.id)) {
          seenIds.add(job.id);
          
          allJobs.push({
            title: job.title,
            company: job.company || 'Company Not Listed',
            location: job.location || 'United States',
            description: cleanSnippet(job.snippet),
            url: job.link,
            id: `jooble_${job.id}`,
          });
        }
      }

      // Rate limiting: wait 1000ms between requests
      await sleep(1000);
    } catch (error) {
      console.error(`[Jooble] Error fetching jobs for keyword '${keyword}':`, error);
      // Continue to next keyword
    }
  }

  console.log(`[Jooble] Total unique jobs fetched: ${allJobs.length}`);
  
  return allJobs;
}

