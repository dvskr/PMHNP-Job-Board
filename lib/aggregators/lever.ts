import { LEVER_SLUGS as LEVER_COMPANIES, LEVER_NAMES as COMPANY_NAMES } from './tenants/lever';
import type { Aggregator, RawJobData } from './types';
import { checkJobHealth, type HealthDecision } from '@/lib/health/check-job-health';

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl: string;
  createdAt: number;
  categories: {
    commitment?: string;
    department?: string;
    level?: string;
    location?: string;
    team?: string;
  };
  description: string;
  descriptionPlain: string;
  lists: Array<{
    text: string;
    content: string;
  }>;
  additional?: string;
  additionalPlain?: string;
}

export interface LeverJobRaw {
  externalId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  applyLink: string;
  job_type: string | null;
  department: string | null;
  postedDate?: string;
}

function formatCompanyName(slug: string): string {
  return COMPANY_NAMES[slug] || slug
    .split(/[-_]/)
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function isPMHNPJob(_title: string, _description: string): boolean {
  return true; // All jobs pass through — central filter in ingestFromSource handles rejection tracking
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCompanyPostings(companySlug: string): Promise<LeverJobRaw[]> {
  const url = `https://api.lever.co/v0/postings/${companySlug}`;
  const companyName = formatCompanyName(companySlug);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[Lever] ${companySlug}: API error ${response.status}`);
      return [];
    }

    const postings: LeverPosting[] = await response.json();
    const totalJobs = postings.length;

    console.log(`[Lever] ${companySlug}: ${totalJobs} jobs fetched`);

    const allJobs = postings.map((posting: LeverPosting) => {
      // Combine description parts
      const descriptionParts = [
        posting.descriptionPlain || posting.description,
        ...(posting.lists?.map((list: { text: string; content: string }) => `${list.text}\n${list.content}`) || []),
        posting.additionalPlain || posting.additional,
      ].filter(Boolean);

      return {
        externalId: `lever-${companySlug}-${posting.id}`,
        title: posting.text,
        company: companyName,
        location: posting.categories?.location || 'Remote',
        description: descriptionParts.join('\n\n'),
        applyLink: posting.hostedUrl || posting.applyUrl,
        job_type: posting.categories?.commitment || null,
        department: posting.categories?.department || null,
        postedDate: new Date(posting.createdAt).toISOString(),
      };
    });

    // Pre-filter for PMHNP relevance
    const relevantJobs = allJobs.filter(job => isPMHNPJob(job.title, job.description));
    console.log(`[Lever] ${companySlug}: ${relevantJobs.length}/${totalJobs} jobs relevant`);

    return relevantJobs;
  } catch (error) {
    console.error(`[Lever] ${companySlug}: Error -`, error);
    return [];
  }
}

export async function fetchLeverJobs(): Promise<LeverJobRaw[]> {
  console.log(`[Lever] Checking ${LEVER_COMPANIES.length} companies for PMHNP jobs...`);

  const allJobs: LeverJobRaw[] = [];
  const failedCompanies: string[] = [];
  const BATCH_SIZE = 10;

  try {
    for (let i = 0; i < LEVER_COMPANIES.length; i += BATCH_SIZE) {
      const batch = LEVER_COMPANIES.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(companySlug => fetchCompanyPostings(companySlug))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === 'fulfilled') {
          allJobs.push(...result.value);
        } else {
          failedCompanies.push(batch[j]);
          console.error(`[Lever] Failed to fetch from ${batch[j]}`);
        }
      }

      if (i + BATCH_SIZE < LEVER_COMPANIES.length) {
        await sleep(200);
      }
    }

    console.log(`[Lever] Total PMHNP jobs fetched: ${allJobs.length}`);

    if (failedCompanies.length > 0) {
      console.log(`[Lever] Failed companies (${failedCompanies.length}): ${failedCompanies.join(', ')}`);
    }

    return allJobs;
  } catch (error) {
    console.error('[Lever] Error in main fetch:', error);
    return allJobs;
  }
}

/**
 * Standardised Aggregator implementation. The orchestrator's
 * fetchFromSource() switch still calls fetchLeverJobs() for backward
 * compat — the registered Aggregator is a Section-2 migration target
 * that future code can use instead.
 */
export const leverAggregator: Aggregator = {
    key: 'lever',
    chunkCount: 1,
    async fetch(): Promise<RawJobData[]> {
        return fetchLeverJobs() as unknown as RawJobData[];
    },
    async probeJob(externalId: string, applyLink: string): Promise<HealthDecision | null> {
        return checkJobHealth(applyLink, 'lever', { externalId });
    },
};
