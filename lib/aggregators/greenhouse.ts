interface GreenhouseJob {
  id: number;
  title: string;
  updated_at: string;
  requisition_id: string;
  location: {
    name: string;
  };
  absolute_url: string;
  internal_job_id: number;
  metadata: Array<Record<string, unknown>>;
  departments: Array<{
    id: number;
    name: string;
  }>;
  offices: Array<{
    id: number;
    name: string;
    location: string;
  }>;
  content: string;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
  meta: {
    total: number;
  };
}

export interface GreenhouseJobRaw {
  externalId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  applyLink: string;
  postedDate?: string;
}

const GREENHOUSE_COMPANIES = [
  // VERIFIED WORKING - Primary sources
  'sondermind',          // 48 PMHNP jobs - PRIMARY SOURCE
  'headway',             // 2 PMHNP jobs
  'modernhealth',        // 1 PMHNP job
  'mantrahealth',        // 1 PMHNP job
  'cerebral',            // 1 PMHNP job (new!)
  'twochairs',           // 3 PMHNP jobs (new!)

  // VERIFIED WORKING - Monitoring (no PMHNP currently)
  'talkspace',           // On Greenhouse, checking regularly
  'ayahealthcare',       // On Greenhouse, checking regularly
  'amwell',              // On Greenhouse, checking regularly
  'octave',              // On Greenhouse, checking regularly
  'growtherapy',         // On Greenhouse, checking regularly

  // REMOVED (404 errors - not on Greenhouse):
  // lifestancehealth, lifestance, brightsidehealth, elliementalhealth, thriveworks

  // === NEW - VERIFIED WITH PMHNP JOBS ===
  'blueskytelepsych',    // Blue Sky Telepsych — 922 PMHNP jobs!
  'bicyclehealth',       // Bicycle Health — 27 PMHNP jobs
  'signifyhealth',       // Signify Health
  'valerahealth',        // Valera Health
  'charliehealth',       // Charlie Health
  'blackbirdhealth',     // Blackbird Health
  'ophelia',             // Ophelia

  // === NEW - VERIFIED VALID, monitoring for PMHNP ===
  'springhealth66',      // Spring Health — 91 total jobs
  'omadahealth',         // Omada Health — 32 total jobs
  'brave',               // Brave Health — 9 total jobs

  // === ADDED 2026-02-13 — VERIFIED WITH PMHNP JOBS ===
  'betterhelp',          // BetterHelp — 19 PMHNP jobs (18 recent)
  'firsthand',           // Firsthand — 13 PMHNP jobs (2 recent)
  'compasspathways',     // COMPASS Pathways — 11 PMHNP jobs (11 recent)

  // === ADDED 2026-02-13 — VALID, monitoring for PMHNP ===
  'alma',                // Alma — 10 total jobs
  'cortica',             // Cortica — 65 total jobs
  'galileo',             // Galileo — 7 total jobs
  'amaehealth',          // Amae Health — 27 total jobs
  'pelago',              // Pelago — 8 total jobs

  // === ADDED 2026-02-13 — EXPANDED SCAN (278 slugs tested) ===
  'bouldercare',         // Boulder Care — 18 PMHNP jobs (18 recent) ⭐

  // === EXPANDED SCAN — VALID, monitoring for PMHNP ===
  'daybreakhealth',      // Daybreak Health — 37 total jobs
  'parallellearning',    // Parallel Learning — 22 total jobs
  'legion',              // Legion — 20 total jobs
  'array',               // Array Behavioral Care — 20 total jobs
  'neuroflow',           // NeuroFlow — 14 total jobs
  'forgehealth',         // Forge Health — 9 total jobs
  'iris',                // Iris — 4 total jobs

  // === PROD DB MINING — 9,295 slugs from 3,602 employers ===
  'strivehealth',        // Strive Health — 14 PMHNP (14 recent) ⭐
  'medelitellc',         // MedElite LLC — 13 PMHNP (13 recent) ⭐
  'solmentalhealth',     // Sol Mental Health — 10 PMHNP (10 recent) ⭐
  'meditelecare',        // MediTelecare — 7 PMHNP (3 recent)
  'cloverhealth',        // Clover Health — 7 PMHNP (7 recent)
  'prenuvo',             // Prenuvo — 7 PMHNP (5 recent)
  'pineparkhealth',      // Pine Park Health — 6 PMHNP (3 recent)
  'moodhealth',          // Moodhealth — 5 PMHNP (5 recent)
  'compasshealthcenter', // Compass Health Center — 4 PMHNP (4 recent)
  'onemedical',          // One Medical — 4 PMHNP (4 recent)
  'seniordoc',           // Senior Doc — 3 PMHNP (3 recent)
  'ascendhealthcare',    // Ascend Healthcare — 3 PMHNP (3 recent)
  'lonestarcircleofcare',// Lone Star Circle of Care — 3 PMHNP (3 recent)
  'hellobackpack',       // Backpack Healthcare — 3 PMHNP (3 recent)
  'northpointrecoveryholdingsllc', // Northpoint Recovery — 3 PMHNP (3 recent)
  'thejanepauleycommunityhealthcenterinc', // Jane Pauley CHC — 2 PMHNP (2 recent)
  'riviamind',           // RIVIA Mind — 2 PMHNP (1 recent)
  'mentalhealthcenterofdenver', // MH Center of Denver — 1 PMHNP
  'overstoryhealth',     // Overstory Health — 1 PMHNP
  'nursing',             // Nursing Wellness Center — 1 PMHNP
  'vitalcaringgroup',    // VitalCaring Group — 1 PMHNP (1 recent)
  'peregrinehealth',     // Peregrine Health — 1 PMHNP (1 recent)
  'tia',                 // Tia — 1 PMHNP
  'lts',                 // LTS — 1 PMHNP (1 recent)
];

import { isRelevantJob } from '../utils/job-filter';

const COMPANY_NAMES: Record<string, string> = {
  // Verified companies
  'talkiatry': 'Talkiatry',
  'talkspace': 'Talkspace',
  'sondermind': 'SonderMind',
  'brightside': 'Brightside Health',
  'brightsidehealth': 'Brightside Health',
  'springhealth': 'Spring Health',
  'lyrahealth': 'Lyra Health',
  'modernhealth': 'Modern Health',
  'cerebral': 'Cerebral',
  'headway': 'Headway',
  'teladoc': 'Teladoc Health',
  'amwell': 'Amwell',
  'mdlive': 'MDLIVE',
  'hims': 'Hims & Hers',
  'ayahealthcare': 'Aya Healthcare',
  'crosscountry': 'Cross Country Healthcare',
  'northwell': 'Northwell Health',
  'providence': 'Providence Health',
  'commonspirit': 'CommonSpirit Health',
  'mantrahealth': 'Mantra Health',

  // New additions
  'lifestancehealth': 'LifeStance Health',
  'lifestance': 'LifeStance Health',
  'twochairs': 'Two Chairs',
  'elliementalhealth': 'Ellie Mental Health',
  'thriveworks': 'Thriveworks',
  'octave': 'Octave',
  'growtherapy': 'Grow Therapy',

  // New verified additions
  'blueskytelepsych': 'Blue Sky Telepsych',
  'bicyclehealth': 'Bicycle Health',
  'springhealth66': 'Spring Health',
  'omadahealth': 'Omada Health',
  'brave': 'Brave Health',

  // Added 2026-02-13
  'betterhelp': 'BetterHelp',
  'firsthand': 'Firsthand',
  'compasspathways': 'COMPASS Pathways',
  'alma': 'Alma',
  'cortica': 'Cortica',
  'galileo': 'Galileo',
  'amaehealth': 'Amae Health',
  'pelago': 'Pelago',

  // Added 2026-02-13 (expanded scan)
  'bouldercare': 'Boulder Care',
  'daybreakhealth': 'Daybreak Health',
  'parallellearning': 'Parallel Learning',
  'legion': 'Legion',
  'array': 'Array Behavioral Care',
  'neuroflow': 'NeuroFlow',
  'forgehealth': 'Forge Health',
  'iris': 'Iris',

  // Added 2026-02-13 (prod DB mining — 9,295 slugs)
  'strivehealth': 'Strive Health',
  'medelitellc': 'MedElite LLC',
  'solmentalhealth': 'Sol Mental Health',
  'meditelecare': 'MediTelecare',
  'cloverhealth': 'Clover Health',
  'prenuvo': 'Prenuvo',
  'pineparkhealth': 'Pine Park Health',
  'moodhealth': 'Moodhealth',
  'compasshealthcenter': 'Compass Health Center',
  'onemedical': 'One Medical',
  'seniordoc': 'Senior Doc',
  'ascendhealthcare': 'Ascend Healthcare',
  'lonestarcircleofcare': 'Lone Star Circle of Care',
  'hellobackpack': 'Backpack Healthcare',
  'northpointrecoveryholdingsllc': 'Northpoint Recovery',
  'thejanepauleycommunityhealthcenterinc': 'Jane Pauley Community Health Center',
  'riviamind': 'RIVIA Mind',
  'mentalhealthcenterofdenver': 'Mental Health Center of Denver',
  'overstoryhealth': 'Overstory Health',
  'nursing': 'Nursing Wellness Center',
  'vitalcaringgroup': 'VitalCaring Group',
  'peregrinehealth': 'Peregrine Health',
  'tia': 'Tia',
  'lts': 'LTS',
};

function formatCompanyName(slug: string): string {
  return COMPANY_NAMES[slug] || slug
    .split(/[-_]/)
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function isPMHNPJob(title: string, content: string): boolean {
  return isRelevantJob(title, content);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCompanyJobs(companySlug: string): Promise<GreenhouseJobRaw[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${companySlug}/jobs?content=true`;
  const companyName = formatCompanyName(companySlug);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[Greenhouse] ${companySlug}: API error ${response.status}`);
      return [];
    }

    const data: GreenhouseResponse = await response.json();
    const jobs = data.jobs || [];
    const totalJobs = jobs.length;

    console.log(`[Greenhouse] ${companySlug}: ${totalJobs} jobs fetched`);

    const allJobs = jobs.map((job: GreenhouseJob) => ({
      externalId: `greenhouse-${companySlug}-${job.id}`,
      title: job.title,
      company: companyName,
      location: job.location?.name || job.offices?.[0]?.name || 'Remote',
      description: job.content || '',
      applyLink: job.absolute_url,
      postedDate: job.updated_at,
    }));

    // Pre-filter for PMHNP relevance
    const relevantJobs = allJobs.filter(job => isPMHNPJob(job.title, job.description));
    console.log(`[Greenhouse] ${companySlug}: ${relevantJobs.length}/${totalJobs} jobs relevant`);

    return relevantJobs;
  } catch (error) {
    console.error(`[Greenhouse] ${companySlug}: Error -`, error);
    return [];
  }
}

export async function fetchGreenhouseJobs(): Promise<GreenhouseJobRaw[]> {
  console.log(`[Greenhouse] Checking ${GREENHOUSE_COMPANIES.length} companies for PMHNP jobs...`);

  const allJobs: GreenhouseJobRaw[] = [];
  const failedCompanies: string[] = [];

  try {
    for (const companySlug of GREENHOUSE_COMPANIES) {
      try {
        const jobs = await fetchCompanyJobs(companySlug);

        if (jobs.length === 0) {
          // Check if it was a real failure or just no PMHNP jobs
          // We'll track this for summary
        } else {
          allJobs.push(...jobs);
        }

        // Rate limiting: 500ms delay between companies
        await sleep(500);
      } catch {
        failedCompanies.push(companySlug);
        console.error(`[Greenhouse] Failed to fetch from ${companySlug}`);
      }
    }

    console.log(`[Greenhouse] Total PMHNP jobs fetched: ${allJobs.length}`);

    if (failedCompanies.length > 0) {
      console.log(`[Greenhouse] Failed companies (${failedCompanies.length}): ${failedCompanies.join(', ')}`);
    }

    return allJobs;
  } catch (error) {
    console.error('[Greenhouse] Error in main fetch:', error);
    return allJobs;
  }
}
