/**
 * ATS Jobs DB Aggregator (via RapidAPI)
 * 
 * Searches across 100K+ employers on multiple ATS platforms:
 * Workday, Greenhouse, Lever, Workable, ApplicantPro, iSolved, Paycom, Dayforce, JazzHR, etc.
 * 
 * Free tier: 100 requests/month (25 jobs per request)
 * This aggregator is budget-conscious — it prioritizes the most efficient search terms.
 */

import { isRelevantJob } from '../utils/job-filter';

interface AtsJobsDbCompany {
    id: string;
    name: string;
}

interface AtsJobsDbLocation {
    location: string;
    city: string;
    state: string;
    country: string;
    latitude?: number;
    longitude?: number;
}

interface AtsJobsDbJob {
    id: string;
    title: string;
    company: AtsJobsDbCompany;
    description: string;
    listing_url: string;
    apply_url: string;
    locations: AtsJobsDbLocation[];
    compensation: unknown;
    employment_type: string;
    workplace_type: string;
    experience_level: string | null;
    source: string;       // e.g. "workday", "greenhouse", "paycom"
    source_id: string;
    created_at: string;
    updated_at: string;
    date_posted: string;
    valid_through: string;
    is_remote: boolean;
}

interface AtsJobsDbResponse {
    jobs: AtsJobsDbJob[];
    total_count: number;
}

export interface AtsJobsDbJobRaw {
    externalId: string;
    title: string;
    company: string;
    location: string;
    description: string;
    applyLink: string;
    job_type: string | null;
    postedDate?: string;
}

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const BASE_URL = 'https://ats-jobs-db.p.rapidapi.com/v1/jobs';
const PAGE_SIZE = 25;

// Search terms ordered by efficiency (most targeted first)
// "PMHNP" alone covers 422 jobs — best ROI per API call
const SEARCH_TERMS = [
    'PMHNP',
    'Psychiatric Nurse Practitioner',
    // Additional terms if budget allows (comment out to conserve)
    // 'Psychiatric Mental Health Nurse Practitioner',
    // 'Psych NP',
    // 'Behavioral Health Nurse Practitioner',
];

// Max pages per search term (to stay within free tier budget)
// PMHNP: 422 jobs / 25 per page = 17 pages
// Psych NP: 2249 jobs / 25 = 90 pages (too many for free tier)
const MAX_PAGES_PER_TERM = 20; // Cap at 500 jobs per term

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function formatLocation(locations: AtsJobsDbLocation[], isRemote: boolean): string {
    if (isRemote) return 'Remote';
    if (!locations || locations.length === 0) return 'United States';
    const loc = locations[0];
    if (loc.city && loc.state) return `${loc.city}, ${loc.state}`;
    return loc.location || 'United States';
}

function mapEmploymentType(type: string | null): string | null {
    if (!type) return null;
    const map: Record<string, string> = {
        'full_time': 'Full-time',
        'part_time': 'Part-time',
        'contract': 'Contract',
        'temporary': 'Per Diem',
        'internship': 'Internship',
        'volunteer': 'Volunteer',
    };
    return map[type] || type;
}

async function fetchPage(query: string, page: number): Promise<AtsJobsDbResponse | null> {
    // Only fetch jobs posted in the last 90 days
    const postedAfter = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T00:00:00Z';

    const params = new URLSearchParams({
        page_size: PAGE_SIZE.toString(),
        location: 'United States',
        q: query,
        page: page.toString(),
        posted_after: postedAfter,
    });

    const url = `${BASE_URL}?${params}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(url, {
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY!,
                'x-rapidapi-host': 'ats-jobs-db.p.rapidapi.com',
            },
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.status === 429) {
            console.warn('[ATS-Jobs-DB] Rate limited — stopping.');
            return null;
        }

        if (!res.ok) {
            console.warn(`[ATS-Jobs-DB] HTTP ${res.status} for "${query}" page ${page}`);
            return null;
        }

        const remaining = res.headers.get('x-ratelimit-requests-remaining');
        if (remaining) {
            console.log(`[ATS-Jobs-DB] API calls remaining: ${remaining}`);
        }

        return await res.json();
    } catch (error) {
        console.warn(`[ATS-Jobs-DB] Error fetching "${query}" page ${page}:`, error);
        return null;
    }
}

export async function fetchAtsJobsDbJobs(): Promise<AtsJobsDbJobRaw[]> {
    if (!RAPIDAPI_KEY) {
        console.error('[ATS-Jobs-DB] RAPIDAPI_KEY env var is not set. Skipping.');
        return [];
    }

    console.log(`[ATS-Jobs-DB] Searching across all ATS platforms for PMHNP jobs...`);

    const allJobs: AtsJobsDbJobRaw[] = [];
    const seenIds = new Set<string>();
    let totalApiCalls = 0;

    for (const query of SEARCH_TERMS) {
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= MAX_PAGES_PER_TERM) {
            const data = await fetchPage(query, page);
            totalApiCalls++;

            if (!data || !data.jobs || data.jobs.length === 0) break;

            for (const job of data.jobs) {
                // Skip duplicates (same job from different search terms)
                if (seenIds.has(job.id)) continue;
                seenIds.add(job.id);

                // Apply PMHNP relevance filter
                if (!isRelevantJob(job.title, job.description || '')) continue;

                // Format company name (API returns object)
                const companyName = job.company?.name || 'Unknown';
                // Clean up slug-style company names like "mcrhealthinfo" -> "Mcrhealthinfo"
                const formattedCompany = companyName.includes(' ')
                    ? companyName
                    : companyName.charAt(0).toUpperCase() + companyName.slice(1);

                allJobs.push({
                    externalId: `atsjobsdb-${job.source}-${job.id}`,
                    title: job.title,
                    company: formattedCompany,
                    location: formatLocation(job.locations, job.is_remote),
                    description: job.description || '',
                    applyLink: job.apply_url || job.listing_url,
                    job_type: mapEmploymentType(job.employment_type),
                    postedDate: job.date_posted || undefined,
                });
            }

            // API doesn't return total_count — paginate as long as we get a full page
            hasMore = data.jobs.length === PAGE_SIZE;
            page++;

            // Rate limiting — be polite
            await sleep(500);
        }

        console.log(`[ATS-Jobs-DB] "${query}": ${allJobs.length} PMHNP jobs found so far (${totalApiCalls} API calls used)`);

        // Rate limit between search terms
        await sleep(1000);
    }

    console.log(`[ATS-Jobs-DB] Total PMHNP jobs fetched: ${allJobs.length} (${totalApiCalls} API calls used)`);
    return allJobs;
}
