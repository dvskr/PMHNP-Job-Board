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
  { slug: 'talkiatry', name: 'Talkiatry' },
  { slug: 'talkspace', name: 'Talkspace' },
  { slug: 'sondermind', name: 'SonderMind' },
];

const PMHNP_KEYWORDS = [
  'pmhnp',
  'psychiatric nurse practitioner',
  'psychiatric mental health nurse practitioner',
  'psych np',
  'psychiatric np',
  'mental health nurse practitioner',
];

function isPMHNPJob(title: string): boolean {
  const lowerTitle = title.toLowerCase();
  return PMHNP_KEYWORDS.some((keyword) => lowerTitle.includes(keyword));
}

async function fetchCompanyJobs(companySlug: string, companyName: string): Promise<GreenhouseJobRaw[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${companySlug}/jobs?content=true`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`Greenhouse API error for ${companySlug}: ${response.status}`);
      return [];
    }

    const data: GreenhouseResponse = await response.json();
    const jobs = data.jobs || [];

    // Filter for PMHNP-related jobs
    const filteredJobs = jobs.filter((job) => isPMHNPJob(job.title));

    return filteredJobs.map((job) => ({
      id: `greenhouse-${companySlug}-${job.id}`,
      title: job.title,
      company: companyName,
      location: job.location?.name || job.offices?.[0]?.name || 'Remote',
      description: job.content || '',
      redirect_url: job.absolute_url,
    }));
  } catch (error) {
    console.error(`Error fetching Greenhouse jobs for ${companySlug}:`, error);
    return [];
  }
}

export async function fetchGreenhouseJobs(): Promise<GreenhouseJobRaw[]> {
  try {
    // Fetch jobs from all companies in parallel
    const results = await Promise.all(
      GREENHOUSE_COMPANIES.map((company) => fetchCompanyJobs(company.slug, company.name))
    );

    // Flatten and return combined array
    const allJobs = results.flat();
    console.log(`Fetched ${allJobs.length} PMHNP jobs from Greenhouse`);
    return allJobs;
  } catch (error) {
    console.error('Error fetching Greenhouse jobs:', error);
    return [];
  }
}

