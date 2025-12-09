interface AdzunaJob {
  id: string;
  title: string;
  company: {
    display_name: string;
  };
  location: {
    display_name: string;
  };
  description: string;
  salary_min?: number;
  salary_max?: number;
  redirect_url: string;
  created: string;
}

interface AdzunaResponse {
  results: AdzunaJob[];
  count: number;
}

export async function fetchAdzunaJobs(): Promise<AdzunaJob[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    console.error('Adzuna API credentials not configured');
    return [];
  }

  const baseUrl = 'https://api.adzuna.com/v1/api/jobs/us/search/1';
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    what: 'PMHNP OR Psychiatric Nurse Practitioner',
    results_per_page: '100',
  });

  try {
    const response = await fetch(`${baseUrl}?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`Adzuna API error: ${response.status} ${response.statusText}`);
    }

    const data: AdzunaResponse = await response.json();
    
    // Debug logging (development only)
    if (process.env.NODE_ENV === 'development' && data.results && data.results.length > 0) {
      console.log('=== SAMPLE ADZUNA JOB (first result) ===');
      console.log(JSON.stringify(data.results[0], null, 2));
      console.log('=== END SAMPLE ===');
    }
    
    return data.results || [];
  } catch (error) {
    console.error('Error fetching Adzuna jobs:', error);
    return [];
  }
}

