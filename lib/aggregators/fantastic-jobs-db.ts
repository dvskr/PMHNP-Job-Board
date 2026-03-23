/**
 * Fantastic Jobs DB Aggregator (Active Jobs DB via RapidAPI)
 * 
 * High-quality job data from 120,000+ organizations across 50+ ATS platforms.
 * Direct employer apply links — no redirects.
 * Refreshed hourly. Ultra plan: 20,000 jobs/mo, 20,000 requests/mo, 5 req/sec.
 * 
 * API: https://active-jobs-db.p.rapidapi.com
 * Endpoint: /active-ats-6m (jobs from last 6 months — backfill)
 * 
 * Added: 2026-03-11 — replacing JSearch ($75/mo, avg quality 5.8)
 * Upgraded to Ultra plan: 2026-03-11 — unlocks 6-month backfill, expired jobs, hourly firehose
 */


// API response structure (derived/enriched fields)
interface FantasticJobApiResponse {
    id: string;
    title: string;
    organization: string;
    organization_url: string | null;
    url: string;                        // direct ATS apply link
    source: string;                     // e.g. "greenhouse", "paylocity", "workday"
    source_type: string;                // "ats"
    date_posted: string;
    date_validthrough: string | null;
    date_created: string;
    description: string | null;
    // Derived location fields
    cities_derived: string[];
    counties_derived: string[];
    regions_derived: string[];          // state names
    countries_derived: string[];
    locations_derived: string[];        // e.g. "Vestavia Hills, Alabama, United States"
    remote_derived: boolean;
    domain_derived: string | null;
    // AI-enriched fields
    ai_employment_type: unknown;
    ai_work_arrangement: unknown;
    employment_type: unknown;
}

export interface FantasticJobOutput {
    externalId: string;
    title: string;
    company: string;
    location: string;
    description: string;
    applyLink: string;
    job_type: string | null;
    postedDate?: string;
    source_ats?: string;
}

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_HOST = 'active-jobs-db.p.rapidapi.com';
// Production: 7-day endpoint — 6-month backfill completed 2026-03-12
const BASE_URL = `https://${API_HOST}/active-ats-7d`;
const PAGE_SIZE = 100;

// PMHNP-specific search filters — ONE term per entry (API does NOT support | OR syntax)
// The API treats "|" as a literal character, so compound filters return 0 results.
// Each term gets its own API call. Overlap is handled by seenUrls dedup.
const TITLE_FILTERS = [
    // ── Core credentials & titles ──
    'PMHNP',
    'PMHNP-BC',
    'Psychiatric Mental Health Nurse Practitioner',
    'Psychiatric Nurse Practitioner',
    'Psychiatric NP',
    'Psych NP',

    // ── Behavioral / Mental Health NP ──
    'Mental Health Nurse Practitioner',
    'Behavioral Health Nurse Practitioner',
    'Mental Health NP',
    'Behavioral Health NP',

    // ── APRN in psychiatry ──
    'Psychiatric APRN',
    'Mental Health APRN',

    // ── Prescriber / provider ──
    'Psychiatric Prescriber',
    'Psychiatry Nurse Practitioner',

    // ── Telepsychiatry ──
    'Telepsychiatry',
    'Remote PMHNP',

    // ── Addiction / MAT ──
    'MAT Nurse Practitioner',
    'Addiction Nurse Practitioner',
    'Suboxone Nurse Practitioner',

    // ── Specialty settings ──
    'Inpatient Psychiatry NP',
    'Outpatient Psychiatry NP',
    'Forensic Psychiatry NP',
    'Child Psychiatry NP',

    // ── Broader psychiatric nursing ──
    'Psychiatric Nurse',
];

// ── Budget Protection ──
// Ultra plan: 20,000 requests/month, 5 req/sec
// 18 filters × 15 pages max = 270 requests/run × 2 runs/day × 30 days = 16,200 (within budget)
// 7-day endpoint returns limited data per filter, 15 pages handles any spikes
const MAX_PAGES_PER_FILTER = 15;
const MAX_REQUESTS_PER_RUN = 500;
const MIN_REMAINING_BUFFER = 2000; // stop if API reports fewer than this remaining

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function formatLocation(job: FantasticJobApiResponse): string {
    if (job.remote_derived) return 'Remote';

    // Use the most specific derived location
    const city = job.cities_derived?.[0];
    const state = job.regions_derived?.[0];

    if (city && state) return `${city}, ${state}`;
    if (city) return city;
    if (state) return state;

    // Fall back to locations_derived
    if (job.locations_derived?.[0]) return job.locations_derived[0];

    return 'United States';
}

function mapEmploymentType(job: FantasticJobApiResponse): string | null {
    const raw = job.ai_employment_type || job.employment_type;
    if (!raw) return null;
    // API can return arrays or objects — coerce to string safely
    const t = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : String(raw);
    if (!t || typeof t !== 'string') return null;
    const lower = t.toLowerCase();
    if (lower.includes('full')) return 'Full-time';
    if (lower.includes('part')) return 'Part-time';
    if (lower.includes('contract')) return 'Contract';
    if (lower.includes('temp') || lower.includes('per diem')) return 'Per Diem';
    return t;
}

async function fetchPage(titleFilter: string, offset: number): Promise<FantasticJobApiResponse[] | null> {
    const params = new URLSearchParams({
        limit: PAGE_SIZE.toString(),
        offset: offset.toString(),
        title_filter: titleFilter,
        location_filter: 'United States',
    });

    const url = `${BASE_URL}?${params}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(url, {
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY!,
                'x-rapidapi-host': API_HOST,
            },
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.status === 429) {
            console.warn('[Fantastic-Jobs-DB] Rate limited — stopping.');
            return null;
        }

        if (!res.ok) {
            console.warn(`[Fantastic-Jobs-DB] HTTP ${res.status} for offset ${offset}`);
            return null;
        }

        const remaining = res.headers.get('x-ratelimit-requests-remaining');
        const remainingNum = remaining ? parseInt(remaining, 10) : null;
        if (remainingNum !== null) {
            console.log(`[Fantastic-Jobs-DB] API calls remaining this month: ${remainingNum}`);
            // Stop if dangerously close to monthly limit
            if (remainingNum < MIN_REMAINING_BUFFER) {
                console.warn(`[Fantastic-Jobs-DB] ⚠️ Only ${remainingNum} requests remaining — stopping to preserve budget`);
                return null;
            }
        }

        const data = await res.json();
        // API returns an array directly
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.warn(`[Fantastic-Jobs-DB] Error at offset ${offset}:`, error);
        return null;
    }
}

export async function fetchFantasticJobsDbJobs(): Promise<FantasticJobOutput[]> {
    if (!RAPIDAPI_KEY) {
        console.error('[Fantastic-Jobs-DB] RAPIDAPI_KEY env var is not set. Skipping.');
        return [];
    }

    console.log(`[Fantastic-Jobs-DB] Searching across 120K+ orgs for PMHNP jobs...`);

    const allJobs: FantasticJobOutput[] = [];
    const seenUrls = new Set<string>();
    let totalApiCalls = 0;
    let budgetExhausted = false;

    for (const titleFilter of TITLE_FILTERS) {
        if (budgetExhausted) break;
        let offset = 0;
        let hasMore = true;

        while (hasMore && offset / PAGE_SIZE < MAX_PAGES_PER_FILTER && totalApiCalls < MAX_REQUESTS_PER_RUN) {
            const jobs = await fetchPage(titleFilter, offset);
            totalApiCalls++;

            if (!jobs || jobs.length === 0) {
                if (!jobs) budgetExhausted = true; // null = rate limited or budget exhausted
                break;
            }

            for (const job of jobs) {
                // Skip duplicates from overlapping search terms
                const jobKey = job.url || job.id;
                if (seenUrls.has(jobKey)) continue;
                seenUrls.add(jobKey);

                // Apply PMHNP relevance filter

                allJobs.push({
                    externalId: `fantasticjobs-${job.source || 'unknown'}-${job.id}`,
                    title: job.title,
                    company: job.organization || 'Unknown',
                    location: formatLocation(job),
                    description: job.description || '',
                    applyLink: job.url,
                    job_type: mapEmploymentType(job),
                    postedDate: job.date_posted || job.date_created || undefined,
                    source_ats: job.source,
                });
            }

            hasMore = jobs.length === PAGE_SIZE;
            offset += PAGE_SIZE;

            // Rate limiting — Ultra plan: 5 req/sec
            await sleep(200);
        }

        console.log(`[Fantastic-Jobs-DB] Filter "${titleFilter.substring(0, 40)}...": ${allJobs.length} PMHNP jobs found (${totalApiCalls} API calls)`);

        // Rate limit between filters
        await sleep(1000);
    }

    console.log(`[Fantastic-Jobs-DB] Total: ${allJobs.length} PMHNP jobs (${totalApiCalls} API calls used)`);
    return allJobs;
}
