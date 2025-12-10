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
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  redirect_url: string;
  job_type: string | null;
  department: string | null;
}

const LEVER_COMPANIES = [
  // Working companies only (verified via testing)
  'carbonhealth',        // Carbon Health - no PMHNP currently, monitoring
  
  // Note: Removed 13 companies that returned 404 (not on Lever)
  // Can be re-added if they join Lever in the future
];

const PMHNP_KEYWORDS = [
  'pmhnp',
  'psychiatric',
  'psych np',
  'psych nurse',
  'mental health nurse',
  'behavioral health nurse',
  'psychiatric mental health',
  'psychiatric aprn',
];

const COMPANY_NAMES: Record<string, string> = {
  'headway': 'Headway',
  'growtherapy': 'Grow Therapy',
  'twochairs': 'Two Chairs',
  'alma': 'Alma',
  'octavebioscience': 'Octave Bioscience',
  'riaboregional': 'RIA Regional',
  'zocdoc': 'Zocdoc',
  'devoted': 'Devoted Health',
  'clover': 'Clover Health',
  'onemedical': 'One Medical',
  'carbonhealth': 'Carbon Health',
  'nomadhealth': 'Nomad Health',
  'trustedhealth': 'Trusted Health',
  'incrediblehealth': 'Incredible Health',
};

function formatCompanyName(slug: string): string {
  return COMPANY_NAMES[slug] || slug
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function isPMHNPJob(title: string, description: string): boolean {
  const searchText = `${title} ${description}`.toLowerCase();
  return PMHNP_KEYWORDS.some(keyword => searchText.includes(keyword));
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

    // Filter for PMHNP-related jobs
    const filteredPostings = postings.filter((posting) =>
      isPMHNPJob(posting.text, posting.descriptionPlain || posting.description || '')
    );
    const relevantCount = filteredPostings.length;

    console.log(`[Lever] ${companySlug}: ${totalJobs} total, ${relevantCount} PMHNP-relevant`);

    return filteredPostings.map((posting) => {
      // Combine description parts
      const descriptionParts = [
        posting.descriptionPlain || posting.description,
        ...(posting.lists?.map((list) => `${list.text}\n${list.content}`) || []),
        posting.additionalPlain || posting.additional,
      ].filter(Boolean);

      return {
        id: `lever-${companySlug}-${posting.id}`,
        title: posting.text,
        company: companyName,
        location: posting.categories?.location || 'Remote',
        description: descriptionParts.join('\n\n'),
        redirect_url: posting.hostedUrl || posting.applyUrl,
        job_type: posting.categories?.commitment || null,
        department: posting.categories?.department || null,
      };
    });
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
      } catch (error) {
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
