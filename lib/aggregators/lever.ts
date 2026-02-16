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

const LEVER_COMPANIES = [
  // === VERIFIED — Have PMHNP jobs ===
  'lifestance',          // LifeStance Health — 100+ PMHNP jobs (BIGGEST SOURCE)
  'talkiatry',           // Talkiatry — 59 PMHNP jobs
  'includedhealth',      // Included Health — 6 PMHNP jobs
  'lyrahealth',          // Lyra Health — 1 PMHNP job

  // === VERIFIED — Valid, monitoring for PMHNP ===
  'carbonhealth',        // Carbon Health — 0 currently but valid endpoint

  // === ADDED 2026-02-13 — VALID, monitoring for PMHNP ===
  'prosper',             // Prosper — 11 total jobs

  // === ADDED 2026-02-13 — EXPANDED SCAN ===
  'bighealth',           // Big Health — 7 total jobs
  'genesis',             // Genesis — 4 total jobs
  'sesame',              // Sesame — 1 total jobs

  // === PROD DB MINING — 9,295 slugs from 3,602 employers ===
  'mindful',             // Mindful Haven — 5 PMHNP (0 recent)
  'athenapsych',         // AthenaPsych — 4 PMHNP (0 recent)
  'seven-starling',      // Seven Starling — 3 PMHNP (3 recent)
  'beckley-clinical',    // Beckley Clinical — 1 PMHNP
  'synapticure',         // SynaptiCure — 1 PMHNP
  'arundellodge',        // Arundel Lodge — 1 PMHNP

  // === ADDED 2026-02-16 — Full ATS Discovery (189 companies scanned) ===
  'ro',                  // Ro Health — 40 total jobs
  'advocate',            // Advocate Health — 9 total jobs
  'ucsf',                // UCSF Health — 1 total job
];

import { isRelevantJob } from '../utils/job-filter';

const COMPANY_NAMES: Record<string, string> = {
  'talkiatry': 'Talkiatry',
  'includedhealth': 'Included Health',
  'lyrahealth': 'Lyra Health',
  'carbonhealth': 'Carbon Health',
  'prosper': 'Prosper',
  'bighealth': 'Big Health',
  'genesis': 'Genesis',
  'sesame': 'Sesame',

  // Added 2026-02-13 (prod DB mining)
  'mindful': 'Mindful Haven',
  'athenapsych': 'AthenaPsych',
  'seven-starling': 'Seven Starling',
  'beckley-clinical': 'Beckley Clinical',
  'synapticure': 'SynaptiCure',
  'arundellodge': 'Arundel Lodge',

  // Added 2026-02-16 (ATS discovery)
  'ro': 'Ro Health',
  'advocate': 'Advocate Health',
  'ucsf': 'UCSF Health',
};

function formatCompanyName(slug: string): string {
  return COMPANY_NAMES[slug] || slug
    .split(/[-_]/)
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function isPMHNPJob(title: string, description: string): boolean {
  return isRelevantJob(title, description);
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

  try {
    for (const companySlug of LEVER_COMPANIES) {
      try {
        const jobs = await fetchCompanyPostings(companySlug);
        allJobs.push(...jobs);

        // Rate limiting: 500ms delay between companies
        await sleep(500);
      } catch {
        failedCompanies.push(companySlug);
        console.error(`[Lever] Failed to fetch from ${companySlug}`);
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
