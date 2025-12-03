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
  { slug: 'headway', name: 'Headway' },
];

const PMHNP_KEYWORDS = [
  'pmhnp',
  'psychiatric nurse practitioner',
  'psychiatric mental health nurse practitioner',
  'psych np',
  'psychiatric np',
  'mental health nurse practitioner',
];

function isPMHNPJob(title: string, description: string): boolean {
  const lowerTitle = title.toLowerCase();
  const lowerDescription = description.toLowerCase();
  const combinedText = `${lowerTitle} ${lowerDescription}`;
  
  return PMHNP_KEYWORDS.some((keyword) => combinedText.includes(keyword));
}

async function fetchCompanyPostings(companySlug: string, companyName: string): Promise<LeverJobRaw[]> {
  const url = `https://api.lever.co/v0/postings/${companySlug}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`Lever API error for ${companySlug}: ${response.status}`);
      return [];
    }

    const postings: LeverPosting[] = await response.json();

    // Filter for PMHNP-related jobs
    const filteredPostings = postings.filter((posting) =>
      isPMHNPJob(posting.text, posting.descriptionPlain || posting.description || '')
    );

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
    console.error(`Error fetching Lever postings for ${companySlug}:`, error);
    return [];
  }
}

export async function fetchLeverJobs(): Promise<LeverJobRaw[]> {
  try {
    // Fetch jobs from all companies in parallel
    const results = await Promise.all(
      LEVER_COMPANIES.map((company) => fetchCompanyPostings(company.slug, company.name))
    );

    // Flatten and return combined array
    const allJobs = results.flat();
    console.log(`Fetched ${allJobs.length} PMHNP jobs from Lever`);
    return allJobs;
  } catch (error) {
    console.error('Error fetching Lever jobs:', error);
    return [];
  }
}

