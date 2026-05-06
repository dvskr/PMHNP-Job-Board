/**
 * ATS Jobs DB (RapidAPI) aggregator.
 *
 * API: https://ats-jobs-db.p.rapidapi.com
 * Subscribed plan (2026-05-06): **Pro — $49/mo, 10,000 req/mo, 500 req/min**
 *
 * Strategy — single advanced-search call per run:
 *   POST /v1/jobs/search with `queries` = [all PMHNP variants] (OR'd
 *   server-side), filtered to ATS sources we trust, paginated until the
 *   per-run job budget is hit. One pass total — no second broadening
 *   pass like fantastic-jobs-db, because multi-query OR is built-in.
 *
 * Sized for Pro plan with ~30× headroom so a busy day or a future
 * additional pass (e.g. expired-jobs probe) doesn't tip us over:
 *   - 1 cron run/day
 *   - up to 8 pages × 50 = 400 jobs/run
 *   - max 10 calls/run
 *   - ~10 calls/run × 30 days = 300 req/month  (3% of 10k Pro cap)
 *
 * The endpoint reports remaining quota via `x-ratelimit-requests-remaining`
 * (same convention as Fantastic-Jobs-DB). MIN_REMAINING_BUFFER refuses
 * to start a run when remaining drops near zero.
 */

import { RateLimiter } from './types';

const API_HOST = 'ats-jobs-db.p.rapidapi.com';
const SEARCH_URL = `https://${API_HOST}/v1/jobs/search`;

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? '';

const PAGE_SIZE = 50;
const MAX_PAGES_PER_RUN = 8;
const MAX_REQUESTS_PER_RUN = 10;
const MAX_JOBS_PER_RUN = 400;
// Don't start a run that could push us over the monthly cap. One run
// burns at most MAX_REQUESTS_PER_RUN calls; the buffer adds a small
// safety margin for any concurrent admin trigger. Plan-agnostic — works
// on Basic (100/mo), Pro (10k), and Ultra (100k) alike.
const MIN_REMAINING_BUFFER = MAX_REQUESTS_PER_RUN + 5;
const PAGE_RATE_LIMIT_MS = 1000;

import { ATS_JOBS_DB_QUERIES, ATS_JOBS_DB_SOURCES } from './search-terms/ats-jobs-db';

// Schema confirmed via live probe 2026-05-06.
interface AtsJobsDbLocation {
    location?: string;
    city?: string;
    state?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
}

interface AtsJobsDbCompensation {
    min?: number | null;
    max?: number | null;
    currency?: string | null;
    period?: string | null; // 'hour' | 'year' | 'month' | null (in our seen sample, null)
    raw_text?: string | null;
    is_estimated?: boolean;
}

interface AtsJobsDbApiResponse {
    id?: string;
    title?: string;
    company?: { id?: string; name?: string } | string; // object in current API; string defensively
    description?: string;
    listing_url?: string;
    apply_url?: string;
    locations?: AtsJobsDbLocation[];
    compensation?: AtsJobsDbCompensation | null;
    employment_type?: string; // e.g. 'part_time' | 'full_time' | 'contract'
    workplace_type?: string;  // 'onsite' | 'remote' | 'hybrid'
    experience_level?: string | null;
    source?: string;
    source_id?: string;
    date_posted?: string;
    valid_through?: string;
    is_remote?: boolean;
}

export interface AtsJobsDbOutput {
    externalId: string;
    title: string;
    company: string;
    location: string;
    description: string;
    applyLink: string;
    /** Canonical jobType ("Full-Time" / "Part-Time" / "Contract" / "Per Diem"); the normalizer reads `rawJob.jobType`. */
    jobType: string | null;
    /** Canonical mode ("Remote" / "Hybrid" / "In-Person"). Currently informational; normalizer's text-scan handles mode detection. */
    mode: string | null;
    postedDate?: string;
    sourceSite?: string;
    is_remote?: boolean;
    minSalary?: number;
    maxSalary?: number;
    salaryPeriod?: string;
}

interface RunDiagnostics {
    firstResponseStatus: number | null;
    firstResponseBodySample: string | null;
    rateLimitRemaining: number | null;
    apiCallsUsed: number;
    abortReasons: string[];
}

let runDiag: RunDiagnostics = {
    firstResponseStatus: null,
    firstResponseBodySample: null,
    rateLimitRemaining: null,
    apiCallsUsed: 0,
    abortReasons: [],
};

function resetDiag(): void {
    runDiag = {
        firstResponseStatus: null,
        firstResponseBodySample: null,
        rateLimitRemaining: null,
        apiCallsUsed: 0,
        abortReasons: [],
    };
}

export function getLastRunDiagnostics(): RunDiagnostics {
    return { ...runDiag };
}

function pickFirst<T>(...vals: Array<T | undefined | null>): T | null {
    for (const v of vals) {
        if (v !== undefined && v !== null) return v;
    }
    return null;
}

function extractCompanyName(c: AtsJobsDbApiResponse['company']): string {
    if (!c) return 'Unknown';
    if (typeof c === 'string') return c;
    return c.name ?? 'Unknown';
}

function formatLocation(job: AtsJobsDbApiResponse): string {
    if (job.is_remote) return 'Remote';
    const first = job.locations?.[0];
    if (first) {
        if (first.city && first.state) return `${first.city}, ${first.state}`;
        if (first.location) return first.location;
        if (first.state) return first.state;
        if (first.city) return first.city;
        if (first.country) return first.country;
    }
    return 'United States';
}

/**
 * Map workplace_type ("onsite"/"remote"/"hybrid") to our canonical
 * `mode` taxonomy ("In-Person"/"Remote"/"Hybrid"). Keeps the rest of
 * the pipeline (filters, JobCard, schema.org JobPosting) on a single
 * vocabulary regardless of source.
 */
function mapWorkplaceType(wt: string | undefined): string | null {
    if (!wt) return null;
    const v = wt.toLowerCase();
    if (v === 'remote') return 'Remote';
    if (v === 'hybrid') return 'Hybrid';
    if (v === 'onsite' || v === 'on-site' || v === 'in-person') return 'In-Person';
    return null;
}

/**
 * Map employment_type to our canonical jobType ("Full-Time" /
 * "Part-Time" / "Contract" / "Per Diem"). Read by job-normalizer's
 * `rawJob.jobType` lookup before falling through to text detection.
 */
function mapEmploymentType(et: string | undefined): string | null {
    if (!et) return null;
    const v = et.toLowerCase();
    if (v.includes('full')) return 'Full-Time';
    if (v.includes('part')) return 'Part-Time';
    if (v.includes('contract')) return 'Contract';
    if (v.includes('temp') || v.includes('per_diem') || v.includes('per diem') || v.includes('prn')) return 'Per Diem';
    return null;
}

/**
 * Best-effort mapping from the API's compensation object to our
 * (minSalary, maxSalary, salaryPeriod) tuple. The downstream salary
 * normalizer converts everything to annual equivalents and applies
 * sanity bounds (lib/salary-normalizer.ts), so we just pass values
 * through as-is here.
 */
function extractCompensation(c: AtsJobsDbCompensation | null | undefined): {
    minSalary?: number;
    maxSalary?: number;
    salaryPeriod?: string;
} {
    if (!c) return {};
    const out: { minSalary?: number; maxSalary?: number; salaryPeriod?: string } = {};
    if (typeof c.min === 'number' && c.min > 0) out.minSalary = c.min;
    if (typeof c.max === 'number' && c.max > 0) out.maxSalary = c.max;
    if (typeof c.period === 'string') out.salaryPeriod = c.period;
    return out;
}

interface SearchBody {
    queries: string[];
    locations: string[];
    sources: string[];
    posted_after?: string;
    page: number;
    page_size: number;
}

async function fetchPage(body: SearchBody): Promise<AtsJobsDbApiResponse[] | null> {
    try {
        const res = await fetch(SEARCH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-rapidapi-host': API_HOST,
                'x-rapidapi-key': RAPIDAPI_KEY,
            },
            body: JSON.stringify(body),
        });

        if (runDiag.firstResponseStatus === null) {
            runDiag.firstResponseStatus = res.status;
        }

        const remaining = res.headers.get('x-ratelimit-requests-remaining');
        const remainingNum = remaining ? parseInt(remaining, 10) : null;
        if (remainingNum !== null) {
            runDiag.rateLimitRemaining = remainingNum;
            console.log(`[ATS-Jobs-DB] API requests remaining this month: ${remainingNum}`);
            if (remainingNum < MIN_REMAINING_BUFFER) {
                console.warn(`[ATS-Jobs-DB] ⚠️ Only ${remainingNum} requests remaining — stopping to preserve budget`);
                runDiag.abortReasons.push(`budget-${remainingNum}`);
                return null;
            }
        }

        if (!res.ok) {
            const text = await res.text();
            if (runDiag.firstResponseBodySample === null) {
                runDiag.firstResponseBodySample = text.slice(0, 300);
            }
            console.warn(`[ATS-Jobs-DB] HTTP ${res.status}: ${text.slice(0, 200)}`);
            runDiag.abortReasons.push(`http-${res.status}`);
            return null;
        }

        const data = await res.json();
        if (runDiag.firstResponseBodySample === null) {
            runDiag.firstResponseBodySample = JSON.stringify(data).slice(0, 300);
        }

        // The API may return an array OR a wrapper object with `jobs`/`results`.
        // Defensive parsing for whichever shape lands.
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.jobs)) return data.jobs;
        if (Array.isArray(data?.results)) return data.results;
        if (Array.isArray(data?.data)) return data.data;
        console.warn('[ATS-Jobs-DB] Unexpected response shape; expected array or {jobs:[]}');
        return [];
    } catch (e) {
        console.warn('[ATS-Jobs-DB] Fetch error:', e);
        runDiag.abortReasons.push(`exception-${e instanceof Error ? e.name : 'unknown'}`);
        return null;
    }
}

export async function fetchAtsJobsDbJobs(): Promise<AtsJobsDbOutput[]> {
    if (!RAPIDAPI_KEY) {
        console.error('[ATS-Jobs-DB] RAPIDAPI_KEY env var is not set. Skipping.');
        return [];
    }
    resetDiag();

    // Daily cron — fetch jobs posted in the last 48h to absorb any
    // schedule slippage. The orchestrator's normalizer already enforces
    // a 60-day staleness gate downstream, so a wider window here is safe.
    const postedAfter = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const out: AtsJobsDbOutput[] = [];
    const seen = new Set<string>();
    const callBudget = { used: 0, cap: MAX_REQUESTS_PER_RUN };
    const jobBudget = { used: 0, cap: MAX_JOBS_PER_RUN };
    const rateLimiter = new RateLimiter(PAGE_RATE_LIMIT_MS);

    let page = 1;
    while (page <= MAX_PAGES_PER_RUN && callBudget.used < callBudget.cap && jobBudget.used < jobBudget.cap) {
        const jobs = await fetchPage({
            queries: [...ATS_JOBS_DB_QUERIES],
            locations: ['United States'],
            sources: [...ATS_JOBS_DB_SOURCES],
            posted_after: postedAfter,
            page,
            page_size: PAGE_SIZE,
        });
        callBudget.used++;

        if (!jobs) break;
        if (jobs.length === 0) break;

        jobBudget.used += jobs.length;

        for (const job of jobs) {
            const id = job.id != null ? String(job.id) : null;
            // apply_url is the canonical apply destination; listing_url is
            // a fallback when apply_url is missing.
            const url = pickFirst(job.apply_url, job.listing_url);
            if (!id || !url) continue;
            const externalId = `atsjobsdb-${job.source ?? 'unknown'}-${id}`;
            if (seen.has(externalId)) continue;
            seen.add(externalId);

            const comp = extractCompensation(job.compensation ?? null);
            out.push({
                externalId,
                title: job.title ?? '',
                company: extractCompanyName(job.company),
                location: formatLocation(job),
                description: job.description ?? '',
                applyLink: url,
                jobType: mapEmploymentType(job.employment_type),
                mode: mapWorkplaceType(job.workplace_type),
                postedDate: job.date_posted ?? undefined,
                sourceSite: job.source ?? undefined,
                is_remote: job.is_remote,
                ...comp,
            });
        }

        if (jobs.length < PAGE_SIZE) break;
        page++;
        await rateLimiter.throttle();
    }

    runDiag.apiCallsUsed = callBudget.used;
    console.log(
        `[ATS-Jobs-DB] Total: ${out.length} unique jobs kept ` +
        `(${callBudget.used}/${callBudget.cap} calls, ` +
        `${jobBudget.used}/${jobBudget.cap} jobs delivered)`,
    );
    return out;
}

import type { Aggregator, RawJobData, FetchOptions } from './types';
import { checkJobHealth, type HealthDecision } from '@/lib/health/check-job-health';

export const atsJobsDbAggregator: Aggregator = {
    key: 'ats-jobs-db',
    chunkCount: 1,
    async fetch(_opts: FetchOptions = {}): Promise<RawJobData[]> {
        return (await fetchAtsJobsDbJobs()) as unknown as RawJobData[];
    },
    async probeJob(_externalId: string, applyLink: string): Promise<HealthDecision | null> {
        // Apply links here point at the underlying ATS (greenhouse, lever,
        // workday, etc.). The generic HTTP probe + per-source soft-404
        // detector handles them downstream — no source-specific probe API
        // is exposed by ats-jobs-db itself.
        return checkJobHealth(applyLink, 'ats-jobs-db');
    },
};
