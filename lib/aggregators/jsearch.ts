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

import { isRelevantJob } from '../utils/job-filter';
import {
    SEARCH_QUERIES,
    STATES as LOCATIONS,
    TOP_500_CITIES as CITIES,
    TOP_EMPLOYERS
} from './constants';

const LOCATION_KEYWORDS = [
    'PMHNP',
    'Psychiatric Nurse Practitioner',
    'Psychiatric Mental Health Nurse Practitioner',
    'Psych Nurse',
    'Mental Health APN',
    'Psychiatric APN'
];

// Full keyword set for cron national + state searches (catches all title variations)
const CRON_FULL_KEYWORDS = [...SEARCH_QUERIES];

// Slim keyword set for city-level cron searches (JSearch returns same results at city granularity)
const CRON_CITY_KEYWORDS = [
    'PMHNP',
    'Psychiatric Nurse Practitioner',
];

// How many pages to fetch per query (each page = ~10 jobs)
const PAGES_PER_QUERY = 5;
const CRON_PAGES_PER_QUERY = 2; // Niche specialty — page 3+ rarely has new results

// Rate limiting delay between API calls (ms)
const DELAY_BETWEEN_REQUESTS = 334; // ~3 requests per second

// Hard time budget for cron runs (Vercel timeout is 300s)
const CRON_TIME_BUDGET_MS = 250_000; // 250s — leave 50s buffer

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
    page: number = 1,
    retries: number = 2
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
        date_posted: 'week', // 1-week lookback — resilient to outages, catches more with expanded keywords
        country: 'us',
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
            if (response.status === 429 && retries > 0) {
                const wait = 2000 + Math.random() * 2000;
                console.warn(`[JSearch] Rate limited on "${query}", retrying in ${Math.round(wait)}ms... (${retries} retries left)`);
                await sleep(wait);
                return fetchJSearchPage(query, page, retries - 1);
            }
            console.error(`[JSearch] HTTP ${response.status} for "${query}" page ${page}`);
            return [];
        }

        const data: JSearchResponse = await response.json();
        return data.data || [];
    } catch (error) {
        if (retries > 0) {
            await sleep(1000);
            return fetchJSearchPage(query, page, retries - 1);
        }
        console.error(`[JSearch] Error fetching "${query}" page ${page}:`, error);
        return [];
    }
}

/**
 * Helper: sleep for rate limiting
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main export: Fetch all PMHNP jobs from JSearch
 */
export async function fetchJSearchJobs(
    options: { pagesPerQuery?: number; specificQueries?: string[]; chunk?: number } = {}
): Promise<Array<Record<string, unknown>>> {
    const apiKey = process.env.RAPIDAPI_KEY;

    if (!apiKey) {
        console.error('[JSearch] RAPIDAPI_KEY not set — skipping JSearch ingestion');
        return [];
    }

    const isCronChunk = options.chunk !== undefined && options.chunk >= 0;
    const pagesPerQuery = options.pagesPerQuery || (isCronChunk ? CRON_PAGES_PER_QUERY : PAGES_PER_QUERY);
    const startTime = Date.now();

    // Build Execution Queue
    let queue: string[] = [];

    if (options.specificQueries) {
        queue = options.specificQueries;
    } else if (isCronChunk) {
        // ── Cron mode: 8 chunks — all 23 keywords for national/state, slim 2 for cities ──
        const chunkId = options.chunk!;
        const employerQueries = TOP_EMPLOYERS.map(emp => `${emp} PMHNP`);

        // States split into two halves (A-M, N-Z + Remote)
        const midpoint = Math.ceil(LOCATIONS.length / 2);
        const statesFirstHalf = LOCATIONS.slice(0, midpoint);
        const statesSecondHalf = LOCATIONS.slice(midpoint);

        // Split cities into 5 equal chunks
        const citiesPerChunk = Math.ceil(CITIES.length / 5);

        switch (chunkId) {
            case 0: // National keywords (all 23) + Employers
                queue = [...CRON_FULL_KEYWORDS, ...employerQueries];
                break;
            case 1: // States A-M (23 keywords × ~26 states)
                CRON_FULL_KEYWORDS.forEach(kw => {
                    statesFirstHalf.forEach(loc => queue.push(`${kw} ${loc}`));
                });
                break;
            case 2: // States N-Z + Remote (23 keywords × ~25 states)
                CRON_FULL_KEYWORDS.forEach(kw => {
                    statesSecondHalf.forEach(loc => queue.push(`${kw} ${loc}`));
                });
                break;
            case 3: // Cities slice 1 (2 keywords × ~100 cities)
                CRON_CITY_KEYWORDS.forEach(kw => {
                    CITIES.slice(0, citiesPerChunk).forEach(city => queue.push(`${kw} ${city}`));
                });
                break;
            case 4: // Cities slice 2
                CRON_CITY_KEYWORDS.forEach(kw => {
                    CITIES.slice(citiesPerChunk, citiesPerChunk * 2).forEach(city => queue.push(`${kw} ${city}`));
                });
                break;
            case 5: // Cities slice 3
                CRON_CITY_KEYWORDS.forEach(kw => {
                    CITIES.slice(citiesPerChunk * 2, citiesPerChunk * 3).forEach(city => queue.push(`${kw} ${city}`));
                });
                break;
            case 6: // Cities slice 4
                CRON_CITY_KEYWORDS.forEach(kw => {
                    CITIES.slice(citiesPerChunk * 3, citiesPerChunk * 4).forEach(city => queue.push(`${kw} ${city}`));
                });
                break;
            case 7: // Cities slice 5
                CRON_CITY_KEYWORDS.forEach(kw => {
                    CITIES.slice(citiesPerChunk * 4).forEach(city => queue.push(`${kw} ${city}`));
                });
                break;
            default:
                console.warn(`[JSearch] Unknown chunk ID: ${chunkId}`);
                return [];
        }
        console.log(`[JSearch] Chunk ${chunkId}: ${queue.length} queries (${pagesPerQuery} pages/query, budget: ${CRON_TIME_BUDGET_MS / 1000}s)`);
    } else {
        // ── Full queue (for local/manual runs — no time budget) ──
        const nationalQueries = [...SEARCH_QUERIES];
        const employerQueries = TOP_EMPLOYERS.map(emp => `${emp} PMHNP`);

        const stateQueries: string[] = [];
        SEARCH_QUERIES.forEach(kw => {
            LOCATIONS.forEach(loc => stateQueries.push(`${kw} ${loc}`));
        });

        const cityQueries: string[] = [];
        LOCATION_KEYWORDS.forEach(kw => {
            CITIES.forEach(city => cityQueries.push(`${kw} ${city}`));
        });

        queue = [
            ...nationalQueries,
            ...employerQueries,
            ...stateQueries,
            ...cityQueries,
        ];

        console.log('[JSearch] Strategy Breakdown:');
        console.log(`    - National: ${nationalQueries.length}`);
        console.log(`    - Employers: ${employerQueries.length}`);
        console.log(`    - States: ${stateQueries.length}`);
        console.log(`    - Cities: ${cityQueries.length}`);
    }

    console.log(`[JSearch] Total Execution Queue: ${queue.length} queries (Depth: ${pagesPerQuery} pages/query)`);

    const BATCH_SIZE = 15; // Mega plan: 20 req/sec rate limit

    // VALIDATION STATS
    let totalRawJobs = 0;
    let totalProcessed = 0;
    let droppedByGeo = 0;
    let droppedByFilter = 0;
    let droppedByDup = 0;
    let totalApiCalls = 0;
    let newJobsFound = 0;

    const allJobs: Array<Record<string, unknown>> = [];
    const seenJobIds = new Set<string>();

    for (let i = 0; i < queue.length; i += BATCH_SIZE) {
        // ── Time budget check (cron only) ──
        if (isCronChunk) {
            const elapsed = Date.now() - startTime;
            if (elapsed >= CRON_TIME_BUDGET_MS) {
                console.warn(`[JSearch] Time budget exhausted (${(elapsed / 1000).toFixed(1)}s). Returning ${allJobs.length} jobs collected so far.`);
                break;
            }
        }

        const batch = queue.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(queue.length / BATCH_SIZE);

        console.log(`[JSearch] Batch ${batchNum}/${totalBatches} (${batch.length} queries)${isCronChunk ? ` [${((Date.now() - startTime) / 1000).toFixed(0)}s elapsed]` : ''}`);

        const batchResults = await Promise.all(
            batch.map(async (query) => {
                try {
                    let pageResults: JSearchJob[] = [];
                    // Fetch pages 1..N
                    for (let p = 1; p <= pagesPerQuery; p++) {
                        const jobs = await fetchJSearchPage(query, p);
                        pageResults.push(...jobs);
                        // Stop if page is empty or small
                        if (jobs.length < 5) break;
                        if (p < pagesPerQuery) await sleep(500);
                    }
                    return { query, jobs: pageResults };
                } catch (e) {
                    return { query, jobs: [] as JSearchJob[] };
                }
            })
        );

        // Estimate API calls
        totalApiCalls += (batch.length * pagesPerQuery);

        // Process results from this batch
        for (const { query, jobs } of batchResults) {
            totalRawJobs += jobs.length;

            for (const job of jobs) {
                totalProcessed++;

                if (seenJobIds.has(job.job_id)) {
                    droppedByDup++;
                    continue;
                }

                // Strict Expiry Check
                if (job.job_offer_expiration_timestamp) {
                    const expiryMs = job.job_offer_expiration_timestamp * 1000;
                    if (expiryMs < Date.now()) continue;
                }

                // Global Relevance Gate — strict early filtering before DB layer
                if (!isRelevantJob(job.job_title, job.job_description || '')) {
                    droppedByFilter++;
                    continue;
                }

                seenJobIds.add(job.job_id);
                newJobsFound++;

                allJobs.push({
                    title: job.job_title,
                    employer: job.employer_name || 'Company Not Listed',
                    location: buildLocation(job),
                    description: job.job_description || '',
                    applyLink: job.job_apply_link,
                    externalId: `jsearch_${job.job_id}`,
                    sourceProvider: 'jsearch',
                    sourceSite: job.job_publisher || 'Google Jobs',
                    minSalary: job.job_min_salary,
                    maxSalary: job.job_max_salary,
                    salaryCurrency: job.job_salary_currency || 'USD',
                    salaryPeriod: normalizeSalaryPeriod(job.job_salary_period),
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
        }

        // Pause 3 seconds between batches (Rate limiting: ~3.3 req/sec overall)
        if (i + BATCH_SIZE < queue.length) {
            await sleep(2000);
        }
    }

    console.log(`[JSearch] Complete: ${allJobs.length} unique PMHNP jobs from ${totalApiCalls} API calls`);
    console.log(`[JSearch] VALIDATION STATS:`);
    console.log(`    Total Raw Jobs Fetched: ${totalRawJobs}`);
    console.log(`    Duplicate IDs (seen before): ${droppedByDup}`);
    console.log(`    Dropped by Relevance Filter: ${droppedByFilter}`);
    console.log(`    Final Accepted: ${allJobs.length}`);

    return allJobs;
}
