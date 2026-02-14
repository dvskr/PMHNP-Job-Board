// Jooble API aggregator for PMHNP jobs

import { isRelevantJob } from '../utils/job-filter';

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
export async function fetchJoobleJobs(): Promise<Array<Record<string, unknown>>> {
  const apiKey = process.env.JOOBLE_API_KEY;

  if (!apiKey) {
    console.error('[Jooble] API key not set in environment variables');
    return [];
  }

  const allJobs: Array<Record<string, unknown>> = [];
  const seenIds = new Set<string>();

  for (const keyword of SEARCH_KEYWORDS) {
    try {
      // Fetch up to 5 pages per keyword (20 results per page by default)
      for (let page = 1; page <= 5; page++) {
        const response = await fetch(`https://jooble.org/api/${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            keywords: keyword,
            location: 'United States',
            page: page,
          }),
        });

        const data = await response.json() as JoobleResponse;
        const { totalCount, jobs } = data;

        console.log(`[Jooble] "${keyword}" page ${page}: Found ${totalCount} total, returned ${jobs.length}`);

        if (!jobs || jobs.length === 0) break;

        for (const job of jobs) {
          if (!seenIds.has(job.id)) {
            seenIds.add(job.id);

            // Strict relevance filter — drop non-PMHNP jobs early
            if (!isRelevantJob(job.title, job.snippet || '')) {
              continue;
            }

            // Parse salary string
            // [KEEP EXISTING SALARY PARSING LOGIC]
            let minSalary = null;
            let maxSalary = null;
            let salaryPeriod = null;

            if (job.salary && job.salary.trim()) {
              const salaryStr = job.salary.toLowerCase();
              const hourlyMatch = salaryStr.match(/\$?([\d,]+(?:\.\d+)?)\s*(?:-|to)?\s*\$?([\d,]+(?:\.\d+)?)?\s*(?:per\s*)?(?:hour|hr)/i);
              if (hourlyMatch) {
                minSalary = parseFloat(hourlyMatch[1].replace(/,/g, ''));
                maxSalary = hourlyMatch[2] ? parseFloat(hourlyMatch[2].replace(/,/g, '')) : null;
                salaryPeriod = 'hourly';
              } else {
                const annualMatch = salaryStr.match(/\$?([\d,]+(?:k)?)\s*(?:-|to)?\s*\$?([\d,]+(?:k)?)?/i);
                if (annualMatch) {
                  minSalary = annualMatch[1].toLowerCase().includes('k')
                    ? parseFloat(annualMatch[1].replace(/k/i, '').replace(/,/g, '')) * 1000
                    : parseFloat(annualMatch[1].replace(/,/g, ''));
                  maxSalary = annualMatch[2]
                    ? (annualMatch[2].toLowerCase().includes('k')
                      ? parseFloat(annualMatch[2].replace(/k/i, '').replace(/,/g, '')) * 1000
                      : parseFloat(annualMatch[2].replace(/,/g, '')))
                    : null;
                  salaryPeriod = 'annual';
                }
              }
            }

            let jobType = null;
            if (job.type) {
              const lowerType = job.type.toLowerCase();
              if (lowerType.includes('full-time') || lowerType.includes('full time')) jobType = 'Full-Time';
              else if (lowerType.includes('part-time') || lowerType.includes('part time')) jobType = 'Part-Time';
              else if (lowerType.includes('contract')) jobType = 'Contract';
              else if (lowerType.includes('temporary')) jobType = 'Contract';
              else if (lowerType.includes('per diem')) jobType = 'Per Diem';
            }

            allJobs.push({
              title: job.title,
              company: job.company || 'Company Not Listed',
              location: job.location || 'United States',
              description: cleanSnippet(job.snippet),
              minSalary: minSalary,
              maxSalary: maxSalary,
              salaryPeriod: salaryPeriod,
              jobType,
              applyLink: job.link,
              externalId: `jooble_${job.id}`,
              postedDate: job.updated,
            });
          }
        }

        if (jobs.length < 20) break;

        // Rate limiting: wait 1000ms between pages
        await sleep(1000);
      }
    } catch (error) {
      console.error(`[Jooble] Error fetching jobs for keyword '${keyword}':`, error);
    }
  }

  console.log(`[Jooble] Total unique jobs fetched: ${allJobs.length}`);

  return allJobs;
}

