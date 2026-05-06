/**
 * ATS Jobs DB (RapidAPI) aggregator.
 *
 * API: https://ats-jobs-db.p.rapidapi.com
 * Plans: Basic (100 req/mo, free) · Pro ($49, 10k req/mo) · Ultra ($199, 100k/mo)
 *
 * Strategy — single advanced-search call per run:
 *   POST /v1/jobs/search with `queries` = [all PMHNP variants] (OR'd
 *   server-side), filtered to ATS sources we trust, paginated until the
 *   per-run job budget is hit. One pass total — no second broadening
 *   pass like fantastic-jobs-db, because multi-query OR is built-in.
 *
 * Conservative defaults so the Basic plan (100 req/month) lasts:
 *   - 1 cron run/day
 *   - up to 5 pages × 50 = 250 jobs/run
 *   - ~5 calls/run × 30 days = 150 req/month — but Basic = 100, so
 *     adapter will land near 0 remaining by end of month. Recommend
 *     upgrading to Pro ($49/mo, 10k req/mo) for comfortable headroom.
 *
 * The endpoint reports remaining quota via `x-ratelimit-requests-remaining`
 * (same convention as Fantastic-Jobs-DB). MIN_REMAINING_BUFFER protects
 * against runaway runs near the cap.
 */

import { RateLimiter } from './types';

const API_HOST = 'ats-jobs-db.p.rapidapi.com';
const SEARCH_URL = `https://${API_HOST}/v1/jobs/search`;

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? '';

const PAGE_SIZE = 50;
const MAX_PAGES_PER_RUN = 5;
const MAX_REQUESTS_PER_RUN = 6; // conservative — fits Basic plan with 1 run/day
const MAX_JOBS_PER_RUN = 250;
// Refuse to start a run when fewer than this many monthly requests
// remain. Tuned for Basic (100/mo); set higher if upgrading to Pro/Ultra.
const MIN_REMAINING_BUFFER = 5;
const PAGE_RATE_LIMIT_MS = 1000;

import { ATS_JOBS_DB_QUERIES, ATS_JOBS_DB_SOURCES } from './search-terms/ats-jobs-db';

interface AtsJobsDbApiResponse {
    id?: string | number;
    title?: string;
    company?: string;
    organization?: string;
    employer?: string;
    location?: string;
    locations?: string[];
    city?: string;
    state?: string;
    country?: string;
    is_remote?: boolean;
    description?: string;
    url?: string;
    apply_url?: string;
    apply_link?: string;
    date_posted?: string;
    posted_at?: string;
    posted_date?: string;
    source?: string;
    source_provider?: string;
    employment_type?: string;
    salary_min?: number;
    salary_max?: number;
    salary_period?: string;
}

export interface AtsJobsDbOutput {
    externalId: string;
    title: string;
    company: string;
    location: string;
    description: string;
    applyLink: string;
    employment_type: string | null;
    postedDate?: string;
    sourceSite?: string;
    is_remote?: boolean;
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

function formatLocation(job: AtsJobsDbApiResponse): string {
    if (job.is_remote) return 'Remote';
    const explicit = pickFirst(job.location, job.locations?.[0]);
    if (explicit) return explicit;
    const city = job.city;
    const state = job.state;
    if (city && state) return `${city}, ${state}`;
    if (state) return state;
    if (city) return city;
    return job.country ?? 'United States';
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
            const url = pickFirst(job.url, job.apply_url, job.apply_link);
            if (!id || !url) continue;
            const externalId = `atsjobsdb-${job.source ?? 'unknown'}-${id}`;
            if (seen.has(externalId)) continue;
            seen.add(externalId);

            out.push({
                externalId,
                title: job.title ?? '',
                company: pickFirst(job.company, job.organization, job.employer) ?? 'Unknown',
                location: formatLocation(job),
                description: job.description ?? '',
                applyLink: url,
                employment_type: job.employment_type ?? null,
                postedDate: pickFirst(job.date_posted, job.posted_at, job.posted_date) ?? undefined,
                sourceSite: job.source ?? job.source_provider ?? undefined,
                is_remote: job.is_remote,
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
