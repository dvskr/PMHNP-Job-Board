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
  // === VERIFIED â€” Have PMHNP jobs ===
  'lifestance',          // LifeStance Health â€” 100+ PMHNP jobs (BIGGEST SOURCE)
  'talkiatry',           // Talkiatry â€” 59 PMHNP jobs
  'includedhealth',      // Included Health â€” 6 PMHNP jobs
  'lyrahealth',          // Lyra Health â€” 1 PMHNP job

  // === VERIFIED â€” Valid, monitoring for PMHNP ===
  'carbonhealth',        // Carbon Health â€” 0 currently but valid endpoint

  // === ADDED 2026-02-13 â€” VALID, monitoring for PMHNP ===
  'prosper',             // Prosper â€” 11 total jobs

  // === ADDED 2026-02-13 â€” EXPANDED SCAN ===
  'bighealth',           // Big Health â€” 7 total jobs
  'genesis',             // Genesis â€” 4 total jobs
  'sesame',              // Sesame â€” 1 total jobs

  // === PROD DB MINING â€” 9,295 slugs from 3,602 employers ===
  'mindful',             // Mindful Haven â€” 5 PMHNP (0 recent)
  'athenapsych',         // AthenaPsych â€” 4 PMHNP (0 recent)
  'seven-starling',      // Seven Starling â€” 3 PMHNP (3 recent)
  'beckley-clinical',    // Beckley Clinical â€” 1 PMHNP
  'synapticure',         // SynaptiCure â€” 1 PMHNP
  'arundellodge',        // Arundel Lodge â€” 1 PMHNP

  // === ADDED 2026-02-16 â€” Full ATS Discovery (189 companies scanned) ===
  'ro',                  // Ro Health â€” 40 total jobs
  'advocate',            // Advocate Health â€” 9 total jobs
  'ucsf',                // UCSF Health â€” 1 total job

  // === ADDED 2026-02-16 â€” CSV test: 6 new PMHNP-active slugs ===
  'lunaphysicaltherapy', // Luna Physical Therapy â€” 108 PMHNP
  'guidestareldercare',  // Guidestar Eldercare â€” 31 PMHNP
  'next-health',         // Next Health â€” 4 PMHNP
  'ekohealth',           // Eko Health â€” 1 PMHNP
  'heartbeathealth',     // Heartbeat Health â€” 1 PMHNP
  'swordhealth',         // Sword Health â€” 1 PMHNP

  // === Additional healthcare companies ===
  'aledade',
  'clarifyhealth',
  'enter.health',
  'heyjane.co',
  'journeyclinical',
  'koalahealth',
  'myplacehealth',
  'nimblerx',
  'pointclickcare',
  'pplacareers.org',
  'salvohealth',
  'sprinterhealth',
  'vivo-care',
  'wepclinical',
  'zushealth',
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

  // Added 2026-02-16 (CSV test)
  'lunaphysicaltherapy': 'Luna Physical Therapy',
  'guidestareldercare': 'GuideStar Eldercare',
  'next-health': 'Next Health',
  'ekohealth': 'Eko Health',
  'heartbeathealth': 'Heartbeat Health',
  'swordhealth': 'Sword Health',

  // Bulk-added CSV companies
  'cardiosense.com': 'Cardiosense',
  'enter.health': 'ENTER',
  'fishawack.com': 'Avalere Health',
  'h1': 'H1',
  'landmarkbio.com': 'Landmark Bio',
  'medcarehouston.com': 'MedCare Pediatric Group',
  'ollie.com': 'Ollie',
  'outpacebio.com': 'Outpace Bio',
  'peakped.com': 'Peak Pediatric Therapies',
  'simulmedia': 'Simulmedia',
  'theattractiongame.online': 'Furum Jobs',
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
