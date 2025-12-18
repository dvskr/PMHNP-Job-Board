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
  metadata: any[];
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
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  redirect_url: string;
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
];

const PMHNP_KEYWORDS = [
  'pmhnp',
  'psychiatric',
  'psych np',
  'psych nurse',
  'mental health nurse',
  'behavioral health nurse',
  'psychiatric mental health',
  'nurse practitioner psychiatry',
  'aprn psych',
  'aprn psychiatric',
  'psychiatric aprn',
];

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
};

function formatCompanyName(slug: string): string {
  return COMPANY_NAMES[slug] || slug
    .split(/[-_]/)
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function isPMHNPJob(title: string, content: string): boolean {
  const searchText = `${title} ${content}`.toLowerCase();
  return PMHNP_KEYWORDS.some(keyword => searchText.includes(keyword));
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

    // Filter for PMHNP-related jobs
    const filteredJobs = jobs.filter((job: GreenhouseJob) => isPMHNPJob(job.title, job.content || ''));
    const relevantCount = filteredJobs.length;

    console.log(`[Greenhouse] ${companySlug}: ${totalJobs} total, ${relevantCount} PMHNP-relevant`);

    return filteredJobs.map((job: GreenhouseJob) => ({
      id: `greenhouse-${companySlug}-${job.id}`,
      title: job.title,
      company: companyName,
      location: job.location?.name || job.offices?.[0]?.name || 'Remote',
      description: job.content || '',
      redirect_url: job.absolute_url,
    }));
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
      } catch (error) {
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
