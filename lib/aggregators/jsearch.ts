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
    'Nurse Practitioner Psychiatry',
    'Psychiatric ARNP',
    'Psychiatry Nurse Practitioner',
    'Psychiatric Mental Health NP-BC',
    'New Grad PMHNP',
    'Remote PMHNP',
    'Telehealth Psychiatric Nurse Practitioner',
    'Locum Tenens PMHNP',
    'Travel Psychiatric Nurse Practitioner',
];

const LOCATIONS = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California",
    "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
    "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
    "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
    "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri",
    "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
    "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
    "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
    "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
    "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
    "Remote"
];

const CITIES = [
    "New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX", "Phoenix, AZ",
    "Philadelphia, PA", "San Antonio, TX", "San Diego, CA", "Dallas, TX", "Jacksonville, FL",
    "Austin, TX", "Fort Worth, TX", "San Jose, CA", "Charlotte, NC", "Columbus, OH",
    "Indianapolis, IN", "San Francisco, CA", "Seattle, WA", "Denver, CO", "Nashville, TN",
    "Washington, DC", "Oklahoma City, OK", "El Paso, TX", "Boston, MA", "Portland, OR",
    "Las Vegas, NV", "Detroit, MI", "Memphis, TN", "Baltimore, MD", "Milwaukee, WI",
    "Albuquerque, NM", "Fresno, CA", "Tucson, AZ", "Sacramento, CA", "Mesa, AZ",
    "Kansas City, MO", "Atlanta, GA", "Colorado Springs, CO", "Omaha, NE", "Raleigh, NC",
    "Virginia Beach, VA", "Long Beach, CA", "Miami, FL", "Oakland, CA", "Minneapolis, MN",
    "Tulsa, OK", "Bakersfield, CA", "Tampa, FL", "Wichita, KS", "Arlington, TX",
    "New Orleans, LA", "Cleveland, OH", "Anaheim, CA", "Honolulu, HI", "Riverside, CA",
    "Santa Ana, CA", "Corpus Christi, TX", "Lexington, KY", "Henderson, NV", "Stockton, CA",
    "Saint Paul, MN", "Cincinnati, OH", "Irvine, CA", "Orlando, FL", "Pittsburgh, PA",
    "St. Louis, MO", "Greensboro, NC", "Jersey City, NJ", "Anchorage, AK", "Lincoln, NE",
    "Plano, TX", "Durham, NC", "Buffalo, NY", "Chandler, AZ", "Chula Vista, CA",
    "Toledo, OH", "Madison, WI", "Gilbert, AZ", "Reno, NV", "Fort Wayne, IN",
    "North Las Vegas, NV", "St. Petersburg, FL", "Lubbock, TX", "Irving, TX", "Laredo, TX",
    "Winston-Salem, NC", "Chesapeake, VA", "Glendale, AZ", "Garland, TX", "Scottsdale, AZ",
    "Norfolk, VA", "Boise, ID", "Fremont, CA", "Spokane, WA", "Santa Clarita, CA",
    "Baton Rouge, LA", "Richmond, VA", "Hialeah, FL", "San Bernardino, CA", "Tacoma, WA",
    // Top 101-200
    "Modesto, CA", "Shreveport, LA", "Fayetteville, NC", "Port St. Lucie, FL", "Worcester, MA",
    "Birmingham, AL", "Spring Valley, NV", "Frisco, TX", "Grand Rapids, MI", "Rochester, NY",
    "Yonkers, NY", "Newark, NJ", "Augusta, GA", "Akron, OH", "McKinney, TX", "Dayton, OH",
    "Columbus, GA", "Overland Park, KS", "Grand Prairie, TX", "Sunrise Manor, NV", "Tallahassee, FL",
    "Naperville, IL", "Salt Lake City, UT", "Knoxville, TN", "Fontana, CA", "Aurora, IL",
    "Oceanside, CA", "Cape Coral, FL", "Chattanooga, TN", "Huntsville, AL", "Springfield, MA",
    "Vancouver, WA", "Tempe, AZ", "Moreno Valley, CA", "Sioux Falls, SD", "Peoria, AZ",
    "Santa Rosa, CA", "Fort Lauderdale, FL", "Erie, PA", "Elk Grove, CA", "Salinas, CA",
    "Rancho Cucamonga, CA", "Killeen, TX", "Palmdale, CA", "Pembroke Pines, FL", "Springfield, MO",
    "Hollywood, FL", "Eugene, OR", "Metairie, LA", "Salem, OR", "Vallejo, CA", "Corona, CA",
    "Pasadena, TX", "Joliet, IL", "Lancaster, CA", "Clarksville, TN", "Alexandria, VA",
    "Springfield, IL", "Syracuse, NY", "Hayward, CA", "Kansas City, KS", "Garden Grove, CA",
    "Midland, TX", "Evansville, IN", "Escondido, CA", "Pasadena, CA", "Waco, TX",
    "Carrollton, TX", "Charleston, SC", "Sugar Land, TX", "McAllen, TX", "Cedar Rapids, IA",
    "Miramar, FL", "Gainesville, FL", "Denton, TX", "Bridgeport, CT", "Centennial, CO",
    "Broken Arrow, OK", "Thornton, CO", "Provo, UT", "New Haven, CT", "Sterling Heights, MI",
    "Columbia, MO", "Lakeland, FL", "Olathe, KS", "Thousand Oaks, CA", "Stamford, CT",
    "Spring Hill, FL", "Concord, CA", "Cedar Park, TX", "Murfreesboro, TN", "Elizabeth, NJ",
    // Top 201-300 Candidates (Sampled for coverage)
    "Peoria, IL", "Round Rock, TX", "Kent, WA", "Visalia, CA", "Orange, CA", "Lafayette, LA",
    "Santa Clara, CA", "West Palm Beach, FL", "Hartford, CT", "Fargo, ND", "Billings, MT",
    "Green Bay, WI", "College Station, TX", "Las Cruces, NM", "Beaumont, TX", "Odessa, TX",
    "Abilene, TX", "Pearland, TX", "Richardson, TX", "Berkeley, CA", "Allentown, PA",
    "Norman, OK", "Wilmington, NC", "Arvada, CO", "Independence, MO", "Ann Arbor, MI",
    "Rochester, MN", "Cambridge, MA", "Lowell, MA", "High Point, NC", "Clearwater, FL",
    "Palm Bay, FL", "West Jordan, UT", "Pueblo, CO", "Gresham, OR", "El Monte, CA",
    "Carlsbad, CA", "Temecula, CA", "Costa Mesa, CA", "Downey, CA", "Elgin, IL",
    "South Bend, IN", "Lansing, MI", "Davenport, IA", "Manchester, NH", "Lowell, MA",
    "Centennial, CO", "Everett, WA", "Renton, WA", "Sparks, NV", "Greeley, CO",
    "Tyler, TX", "Wichita Falls, TX", "Lewisville, TX", "League City, TX", "San Mateo, CA",
    "Jurupa Valley, CA", "Daly City, CA", "Fairfield, CA", "Burbank, CA", "Rialto, CA"
];

const LOCATION_KEYWORDS = [
    'PMHNP',
    'Psychiatric Nurse Practitioner',
    'Psychiatric Mental Health Nurse Practitioner',
    'Psych Nurse',
    'Mental Health APN',
    'Psychiatric APN'
];

const TOP_EMPLOYERS = [
    'LifeStance Health',
    'Thriveworks',
    'Talkiatry',
    'Mindpath Health',
    'Geode Health',
    'Foresight Mental Health',
    'Refresh Mental Health',
    'Ellie Mental Health',
    'HCA Healthcare',
    'Acadia Healthcare',
    'Universal Health Services',
    'Veterans Affairs',
    'CVS Health',
    'UnitedHealth Group',
    'Kaiser Permanente',
    'Landmark Health',
    'GuideWell',
    'Centene',
    'Eleanor Health',
    'Bicycle Health',
    'Iris Telehealth',
    'SonderMind',
    'Oak Street Health',
    'VillageMD',
    'One Medical',
    'ChenMed',
    'Brightside Health',
    'CommonSpirit Health',
    'Advocate Health',
    'Providence Health',
    'UPMC',
    'Ascension',
    'Trinity Health',
    'Mass General Brigham',
    'Tenet Healthcare',
    'AdventHealth',
    'Mayo Clinic',
    'Northwell Health',
    'Sutter Health',
    'Intermountain Healthcare',
    'Corewell Health',
    'Baylor Scott & White',
    'Cleveland Clinic',
    'Memorial Hermann',
    'Novant Health',
    'Mercy Health',
    'Banner Health',
    'WellStar Health',
    'Inova Health',
    'Bon Secours',
    'Christus Health',
    'Highmark Health',
    'Sentara Healthcare',
    'Main Line Health',
    'Sharp HealthCare',
    'OhioHealth',
    'Scripps Health',
    'Spectrum Health',
    'Beaumont Health',
    'Fairview Health',
    'Atrium Health',
    'Piedmont Healthcare',
    'Ochsner Health',
    'Legacy Health',
    'MultiCare Health',
    'Henry Ford Health',
    'BJC HealthCare',
    'SSM Health',
    'Gundersen Health',
    'Marshfield Clinic',
    'Aspirus Health',
    'Sanford Health',
    'Essentia Health',
    'LifePoint Health',
    'Community Health Systems',
    'Prime Healthcare'
];

// How many pages to fetch per query (each page = ~10 jobs)
// How many pages to fetch per query (each page = ~10 jobs)
const PAGES_PER_QUERY = 5;

// Rate limiting delay between API calls (ms)
const DELAY_BETWEEN_REQUESTS = 334; // ~3 requests per second

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
        // Gap Closing: Removed 'month' restriction to allow 60-day lookback
        // date_posted: 'month',
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
    options: { pagesPerQuery?: number; specificQueries?: string[] } = {}
): Promise<Array<Record<string, unknown>>> {
    const apiKey = process.env.RAPIDAPI_KEY;

    if (!apiKey) {
        console.error('[JSearch] RAPIDAPI_KEY not set — skipping JSearch ingestion');
        return [];
    }

    const pagesPerQuery = options.pagesPerQuery || PAGES_PER_QUERY;

    // Build Execution Queue
    let queue: string[] = [];

    if (options.specificQueries) {
        queue = options.specificQueries;
    } else {
        // 1. National Level Search (Broad)
        queue.push(...LOCATION_KEYWORDS);

        // 2. Targeted Employer Search (High Yield)
        const employerQueries = TOP_EMPLOYERS.map(emp => `${emp} PMHNP`);
        queue.push(...employerQueries);

        // 3. State Multiplier (Deep)
        LOCATION_KEYWORDS.forEach(kw => {
            LOCATIONS.forEach(loc => {
                queue.push(`${kw} ${loc}`);
            });
        });

        // 4. City Multiplier (Granular - Top 100 US Cities)
        LOCATION_KEYWORDS.forEach(kw => {
            CITIES.forEach(city => {
                queue.push(`${kw} ${city}`);
            });
        });

        console.log('[JSearch] Strategy Breakdown:');
        console.log(`    - National: ${LOCATION_KEYWORDS.length}`);
        console.log(`    - Employers: ${employerQueries.length}`);
        console.log(`    - States: ${LOCATION_KEYWORDS.length * LOCATIONS.length}`);
        console.log(`    - Cities: ${LOCATION_KEYWORDS.length * CITIES.length}`);
    }

    console.log(`[JSearch] Total Execution Queue: ${queue.length} queries (Depth: ${pagesPerQuery} pages/query)`);

    // Process in batches of 10 concurrent requests
    const BATCH_SIZE = 10;

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
        const batch = queue.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(queue.length / BATCH_SIZE);

        console.log(`[JSearch] Processing Batch ${batchNum}/${totalBatches} (${batch.length} queries)...`);

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

                // Global Relevance Gate
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
            await sleep(3000);
        }
    }

    console.log(`[JSearch] Complete: ${allJobs.length} unique PMHNP jobs from ${totalApiCalls} API calls`);
    console.log(`[JSearch] VALIDATION STATS:`);
    console.log(`    Total Raw Jobs Fetched: ${totalRawJobs}`);
    console.log(`    Duplicate IDs (seen before): ${droppedByDup}`);
    console.log(`    Dropped by Relevance Filter: ${droppedByFilter} (This validates filter strictness)`);
    console.log(`    Final Accepted: ${allJobs.length}`);

    return allJobs;
}
