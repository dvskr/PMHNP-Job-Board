// JSearch API aggregator for PMHNP jobs
// Pulls from Google for Jobs (aggregates Indeed, LinkedIn, Glassdoor, ZipRecruiter, etc.)

interface JSearchJob {
    job_id: string;
    employer_name: string;
    employer_logo: string | null;
    employer_website: string | null;
    job_publisher: string;
    job_employment_type: string;
    job_title: string;
    job_apply_link: string;
    job_apply_is_direct: boolean;
    job_description: string;
    job_is_remote: boolean;
    job_posted_at_timestamp: number;
    job_posted_at_datetime_utc: string;
    job_city: string | null;
    job_state: string | null;
    job_country: string;
    job_latitude: number | null;
    job_longitude: number | null;
    job_benefits: string[] | null;
    job_google_link: string;
    job_offer_expiration_datetime_utc: string | null;
    job_offer_expiration_timestamp: number | null;
    job_min_salary: number | null;
    job_max_salary: number | null;
    job_salary_currency: string | null;
    job_salary_period: string | null;
    job_highlights: {
        Qualifications?: string[];
        Responsibilities?: string[];
        Benefits?: string[];
    } | null;
    job_job_title: string | null;
    job_posting_language: string;
    job_onet_soc: string | null;
    job_onet_job_zone: string | null;
    apply_options: Array<{
        publisher: string;
        apply_link: string;
        is_direct: boolean;
    }> | null;
}

interface JSearchResponse {
    status: string;
    request_id: string;
    parameters: {
        query: string;
        page: number;
        num_pages: number;
    };
    data: JSearchJob[];
}

// PMHNP-specific search queries — cast a wide net
// PMHNP-specific search queries — cast a wide net
const SEARCH_QUERIES = [
    'PMHNP',
    'psychiatric nurse practitioner',
    'psychiatric mental health nurse practitioner',
    'behavioral health nurse practitioner',
    'psychiatric APRN',
    'psych NP',
    'mental health NP',
    'PMHNP-BC',
    'psychiatric prescriber',
    'telepsychiatry nurse practitioner',
    // New additions for better coverage --
    'Nurse Practitioner Psychiatry',
    'Psychiatric ARNP',
    'Psychiatry Nurse Practitioner',
    'Psychiatric Mental Health NP-BC',
    'New Grad PMHNP',
    'Remote PMHNP',
    'Telehealth Psychiatric Nurse Practitioner',
    'Locum Tenens PMHNP',
    'Travel Psychiatric Nurse Practitioner',
    'Correctional Psychiatric Nurse Practitioner',
    'Inpatient Psychiatric Nurse Practitioner',
    'Outpatient PMHNP',
];

// How many pages to fetch per query (each page = ~10 jobs)
const PAGES_PER_QUERY = 3;

// Rate limiting delay between API calls (ms)
const DELAY_BETWEEN_REQUESTS = 300;

/**
 * Helper: sleep for rate limiting
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper: create a hash from a string for dedup IDs
 */
function hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

/**
 * Helper: check if a job is relevant to PMHNP
 */
function isRelevantJob(title: string, description: string): boolean {
    const searchText = `${title} ${description}`.toLowerCase();
    const keywords = [
        'pmhnp',
        'psychiatric nurse',
        'psych np',
        'mental health nurse practitioner',
        'psychiatric mental health',
        'psych mental health',
        'psychiatric aprn',
        'pmhnp-bc',
        'psychiatric prescriber',
        'behavioral health nurse practitioner',
        'behavioral health np',
        'psych nurse practitioner',
    ];
    return keywords.some(kw => searchText.includes(kw));
}

/**
 * Build location string from JSearch job data
 */
function buildLocation(job: JSearchJob): string {
    if (job.job_is_remote) {
        if (job.job_city && job.job_state) {
            return `${job.job_city}, ${job.job_state} (Remote)`;
        }
        return 'Remote';
    }
    if (job.job_city && job.job_state) {
        return `${job.job_city}, ${job.job_state}`;
    }
    if (job.job_state) {
        return job.job_state;
    }
    return 'United States';
}

/**
 * Determine salary period from JSearch salary_period field
 */
function normalizeSalaryPeriod(period: string | null): string | null {
    if (!period) return null;
    const p = period.toUpperCase();
    if (p === 'YEAR' || p === 'YEARLY' || p === 'ANNUAL') return 'annual';
    if (p === 'HOUR' || p === 'HOURLY') return 'hourly';
    if (p === 'MONTH' || p === 'MONTHLY') return 'monthly';
    if (p === 'WEEK' || p === 'WEEKLY') return 'weekly';
    return null;
}

/**
 * Fetch a single page of JSearch results
 */
async function fetchJSearchPage(
    query: string,
    page: number = 1
): Promise<JSearchJob[]> {
    const apiKey = process.env.RAPIDAPI_KEY;

    if (!apiKey) {
        console.error('[JSearch] RAPIDAPI_KEY not set in environment variables');
        return [];
    }

    const params = new URLSearchParams({
        query: query,
        page: page.toString(),
        num_pages: '1',
        date_posted: 'month',     // Only jobs from the past month
        country: 'us',            // US jobs only
        language: 'en',
    });

    const url = `https://jsearch.p.rapidapi.com/search?${params}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': apiKey,
                'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
            },
        });

        if (!response.ok) {
            if (response.status === 429) {
                console.warn(`[JSearch] Rate limited on "${query}" page ${page}, waiting 2s...`);
                await sleep(2000);
                return [];
            }
            console.error(`[JSearch] HTTP ${response.status} for "${query}" page ${page}`);
            return [];
        }

        const data: JSearchResponse = await response.json();

        if (data.status !== 'OK') {
            console.error(`[JSearch] API returned status: ${data.status}`);
            return [];
        }

        return data.data || [];
    } catch (error) {
        console.error(`[JSearch] Error fetching "${query}" page ${page}:`, error);
        return [];
    }
}

/**
 * Main export: Fetch all PMHNP jobs from JSearch
 */
export async function fetchJSearchJobs(): Promise<Array<Record<string, unknown>>> {
    const apiKey = process.env.RAPIDAPI_KEY;

    if (!apiKey) {
        console.error('[JSearch] RAPIDAPI_KEY not set — skipping JSearch ingestion');
        return [];
    }

    const allJobs: Array<Record<string, unknown>> = [];
    const seenJobIds = new Set<string>();
    let totalApiCalls = 0;

    console.log('[JSearch] Starting job fetch...');
    console.log(`[JSearch] Queries: ${SEARCH_QUERIES.length}, Pages per query: ${PAGES_PER_QUERY}`);

    for (const query of SEARCH_QUERIES) {
        console.log(`[JSearch] Searching: "${query}"`);

        for (let page = 1; page <= PAGES_PER_QUERY; page++) {
            const jobs = await fetchJSearchPage(query, page);
            totalApiCalls++;

            if (jobs.length === 0) {
                console.log(`[JSearch] "${query}" page ${page}: 0 results, stopping pagination`);
                break;
            }

            let addedThisPage = 0;

            for (const job of jobs) {
                // Skip if we've already seen this job_id (cross-query dedup)
                if (seenJobIds.has(job.job_id)) {
                    continue;
                }

                // Skip if not relevant to PMHNP
                if (!isRelevantJob(job.job_title, job.job_description || '')) {
                    continue;
                }

                seenJobIds.add(job.job_id);
                addedThisPage++;

                // Transform to our standard format
                allJobs.push({
                    title: job.job_title,
                    employer: job.employer_name || 'Company Not Listed',
                    location: buildLocation(job),
                    description: job.job_description || '',
                    applyLink: job.job_apply_link,
                    externalId: `jsearch_${job.job_id}`,
                    sourceProvider: 'jsearch',
                    sourceSite: job.job_publisher || 'Google Jobs',

                    // Salary data (JSearch often has this!)
                    minSalary: job.job_min_salary,
                    maxSalary: job.job_max_salary,
                    salaryCurrency: job.job_salary_currency || 'USD',
                    salaryPeriod: normalizeSalaryPeriod(job.job_salary_period),

                    // Extra metadata
                    employerLogo: job.employer_logo,
                    employerWebsite: job.employer_website,
                    isRemote: job.job_is_remote,
                    employmentType: job.job_employment_type,
                    postedDate: job.job_posted_at_datetime_utc,
                    expiresDate: job.job_offer_expiration_datetime_utc,
                    jobHighlights: job.job_highlights,
                    applyOptions: job.apply_options,
                });
            }

            console.log(`[JSearch] "${query}" page ${page}: ${jobs.length} results, ${addedThisPage} new PMHNP jobs`);

            // Rate limiting between pages
            if (page < PAGES_PER_QUERY) {
                await sleep(DELAY_BETWEEN_REQUESTS);
            }
        }

        // Delay between different queries
        await sleep(DELAY_BETWEEN_REQUESTS);
    }

    console.log(`[JSearch] Complete: ${allJobs.length} unique PMHNP jobs from ${totalApiCalls} API calls`);
    console.log(`[JSearch] Job IDs seen (including non-PMHNP): ${seenJobIds.size}`);

    return allJobs;
}
