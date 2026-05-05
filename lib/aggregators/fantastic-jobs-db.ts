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
    /**
     * Underlying ATS platform reported by the API (greenhouse, paylocity,
     * workday, etc.). Persisted to jobs.source_site so we can analyse
     * which ATSes the aggregator catches.
     */
    sourceSite?: string;
}

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_HOST = 'active-jobs-db.p.rapidapi.com';
// Production default: 7-day endpoint. The 6-month endpoint is used only
// when an admin triggers a backfill via ?endpoint=6m. The job-normalizer
// rejects rows older than 90 days for non-ATS sources (line 519), so a
// 6m backfill effectively becomes a 90-day backfill — caps the useful
// range without us needing a date filter on the API side.
const ENDPOINT_7D = `https://${API_HOST}/active-ats-7d`;
const ENDPOINT_6M = `https://${API_HOST}/active-ats-6m`;
const PAGE_SIZE = 100;

// ── Search Strategy (refactored again 2026-04-30 after live probe) ──────
// The Active Jobs DB (RapidAPI) was probed directly with the new key.
// Findings:
//   - `title_filter` works only as a single literal phrase. OR/AND/quotes
//     are NOT honored (`advanced_title_filter` returns 0 for any OR syntax).
//   - `description_filter` works AND supports `OR` between terms — this
//     is the high-value lever.
//   - `ai_employment_type_filter` works (e.g. FULL_TIME).
//
// Strategy: two passes, deduped by URL.
//   PASS A — per-term title loop (compact list). Each term hits the
//            psychiatric/PMHNP titles directly. ~3 pages each is plenty
//            since most return < 50 unique results.
//   PASS B — description_filter broaden. Title=Nurse Practitioner OR APRN,
//            description=psychiatric/mental-health/PMHNP. Catches the
//            generic-titled jobs that title-only filtering missed.

import {
    FANTASTIC_TITLE_TERMS as TITLE_TERMS,
    FANTASTIC_TITLE_FILTERS_BROAD as TITLE_FILTERS_BROAD,
    FANTASTIC_DESCRIPTION_FILTER_PSYCH as DESCRIPTION_FILTER_PSYCH,
} from './search-terms/fantastic-jobs-db';
import { RateLimiter } from './types';

// ── Budget Protection ──
// Ultra plan: 20,000 requests/month, 5 req/sec
// New 3-pass approach uses ~30-50 calls/run × 2 runs/day × 30d ≈ 3,000.
// Pre-2026-04-30 (the per-filter loop) used up to 390 calls/run, ~23k/mo,
// and DID exhaust the quota. Caps below force-stop well before the next
// quota cliff:
//   MAX_REQUESTS_PER_RUN = 200 — equivalent to 12k/month worst-case
//   MIN_REMAINING_BUFFER = 5000 — refuse to start a run when fewer than
//     this many monthly requests remain. With 60 runs/month a 5k cushion
//     covers ~10 admin-triggered manual runs without dipping below 0.
const MAX_PAGES_PER_FILTER = 15;
const MAX_REQUESTS_PER_RUN = 200;
const MIN_REMAINING_BUFFER = 5000;

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

// Required for every pass.
const BASE_FILTERS: Record<string, string> = {
    location_filter: 'United States',
    // Without description_type=text, the API returns description=null for
    // many jobs — observed via investigate-normalizer-rejections.ts on
    // 2026-04-30: 41/50 normalizer rejections were valid PMHNP titles with
    // 0-length descriptions. The normalizer requires a description body
    // for LLM enrichment + SEO so the job got dropped at insert time.
    // This param is documented and was confirmed safe via the probe run.
    description_type: 'text',
};

// Per-run diagnostics so we can surface API responses to Discord/console
// without scraping Vercel logs. Reset at the start of each fetch run.
interface RunDiagnostics {
    firstResponseStatus: number | null;
    firstResponseUrl: string | null;
    firstResponseBodySample: string | null;
    rateLimitRemaining: number | null;
    statusCounts: Record<string, number>;
    abortReasons: string[];
}
let runDiag: RunDiagnostics = {
    firstResponseStatus: null,
    firstResponseUrl: null,
    firstResponseBodySample: null,
    rateLimitRemaining: null,
    statusCounts: {},
    abortReasons: [],
};
function resetDiag(): void {
    runDiag = {
        firstResponseStatus: null,
        firstResponseUrl: null,
        firstResponseBodySample: null,
        rateLimitRemaining: null,
        statusCounts: {},
        abortReasons: [],
    };
}

async function fetchPage(
    extraParams: Record<string, string>,
    offset: number,
    endpoint: string,
): Promise<FantasticJobApiResponse[] | null> {
    const params = new URLSearchParams({
        limit: PAGE_SIZE.toString(),
        offset: offset.toString(),
        ...BASE_FILTERS,
        ...extraParams,
    });

    const url = `${endpoint}?${params}`;

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

        // Diagnostics — capture the first response so we can dump it to
        // Discord if the run produces zero rows.
        const statusKey = String(res.status);
        runDiag.statusCounts[statusKey] = (runDiag.statusCounts[statusKey] ?? 0) + 1;
        if (runDiag.firstResponseStatus === null) {
            runDiag.firstResponseStatus = res.status;
            runDiag.firstResponseUrl = url.replace(RAPIDAPI_KEY ?? '', 'XXX');
        }

        if (res.status === 429) {
            // Capture the 429 body + ALL rate-limit headers — without these
            // we can't tell if the throttle is per-second, per-minute, or
            // monthly-quota-exhaustion. Diagnostic-first approach.
            let body429 = '';
            try { body429 = (await res.text()).slice(0, 500); } catch { /* ignore */ }
            const allHeaders: Record<string, string> = {};
            res.headers.forEach((v, k) => {
                if (k.toLowerCase().startsWith('x-ratelimit') || k.toLowerCase() === 'retry-after') {
                    allHeaders[k] = v;
                }
            });
            if (runDiag.firstResponseBodySample === null) {
                runDiag.firstResponseBodySample = `429 body: ${body429} | headers: ${JSON.stringify(allHeaders)}`;
            }

            // Honor Retry-After if present, else default to 3s. Try ONCE
            // more — repeated 429 means we're saturating the quota and
            // should abort the pass rather than burn budget.
            const retryAfterRaw = res.headers.get('retry-after');
            const retryAfterSec = retryAfterRaw ? parseInt(retryAfterRaw, 10) : 3;
            const waitMs = Math.max(1000, (Number.isFinite(retryAfterSec) ? retryAfterSec : 3) * 1000);
            console.warn(`[Fantastic-Jobs-DB] 429 body=${body429} headers=${JSON.stringify(allHeaders)} — waiting ${waitMs}ms then retrying once.`);
            await sleep(waitMs);

            const retryRes = await fetch(url, {
                headers: {
                    'x-rapidapi-key': RAPIDAPI_KEY!,
                    'x-rapidapi-host': API_HOST,
                },
                signal: AbortSignal.timeout(15000),
            });
            const retryStatusKey = String(retryRes.status);
            runDiag.statusCounts[retryStatusKey] = (runDiag.statusCounts[retryStatusKey] ?? 0) + 1;
            if (retryRes.status === 429) {
                console.warn('[Fantastic-Jobs-DB] Still rate-limited after retry — aborting pass.');
                runDiag.abortReasons.push('rate-limit-429-after-retry');
                return null;
            }
            if (!retryRes.ok) {
                let body = '';
                try { body = (await retryRes.text()).slice(0, 500); } catch { /* ignore */ }
                console.warn(`[Fantastic-Jobs-DB] Retry returned ${retryRes.status}: ${body}`);
                if (runDiag.firstResponseBodySample === null) runDiag.firstResponseBodySample = body;
                runDiag.abortReasons.push(`retry-http-${retryRes.status}`);
                return null;
            }
            const retryData = await retryRes.json();
            return Array.isArray(retryData) ? retryData : [];
        }

        if (!res.ok) {
            // Read the error body so we know WHY — invalid param, plan
            // restriction, etc. Truncated to keep Vercel logs readable.
            let body = '';
            try { body = (await res.text()).slice(0, 500); } catch { /* ignore */ }
            console.warn(
                `[Fantastic-Jobs-DB] HTTP ${res.status} for offset ${offset} ` +
                `params=${JSON.stringify(extraParams)} body=${body}`,
            );
            if (runDiag.firstResponseBodySample === null) {
                runDiag.firstResponseBodySample = body;
            }
            runDiag.abortReasons.push(`http-${res.status}`);
            return null;
        }

        const remaining = res.headers.get('x-ratelimit-requests-remaining');
        const remainingNum = remaining ? parseInt(remaining, 10) : null;
        if (remainingNum !== null) {
            runDiag.rateLimitRemaining = remainingNum;
            console.log(`[Fantastic-Jobs-DB] API calls remaining this month: ${remainingNum}`);
            // Stop if dangerously close to monthly limit
            if (remainingNum < MIN_REMAINING_BUFFER) {
                console.warn(`[Fantastic-Jobs-DB] ⚠️ Only ${remainingNum} requests remaining — stopping to preserve budget`);
                runDiag.abortReasons.push(`budget-${remainingNum}`);
                return null;
            }
        }

        const data = await res.json();
        // Capture sample of the first SUCCESS body too (truncated, no PII).
        if (runDiag.firstResponseBodySample === null) {
            const dataStr = JSON.stringify(data).slice(0, 300);
            runDiag.firstResponseBodySample = dataStr;
        }
        // API returns an array directly
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.warn(`[Fantastic-Jobs-DB] Error at offset ${offset}:`, error);
        runDiag.abortReasons.push(`exception-${error instanceof Error ? error.name : 'unknown'}`);
        return null;
    }
}

/** Public accessor so the cron can dump diagnostics to Discord. */
export function getLastRunDiagnostics(): RunDiagnostics {
    return { ...runDiag };
}

interface PassResult {
    label: string;
    jobsFound: number;
    apiCalls: number;
    /** True if the pass was abandoned for budget / rate-limit reasons. */
    aborted: boolean;
}

// Per-page throttle: 1 req/sec (~5× under the published 5 req/sec cap),
// safe under any plausible sliding-window enforcement.
const FANTASTIC_PAGE_RATE_LIMIT_MS = 1000;
const FANTASTIC_FILTER_GAP_MS = 2000;

async function runPass(
    label: string,
    extraParams: Record<string, string>,
    out: FantasticJobOutput[],
    seenUrls: Set<string>,
    callBudget: { used: number; cap: number },
    endpoint: string,
    pageRateLimiter: RateLimiter,
): Promise<PassResult> {
    let offset = 0;
    let hasMore = true;
    let pageCalls = 0;
    let initialOut = out.length;
    let aborted = false;

    while (
        hasMore &&
        offset / PAGE_SIZE < MAX_PAGES_PER_FILTER &&
        callBudget.used < callBudget.cap
    ) {
        const jobs = await fetchPage(extraParams, offset, endpoint);
        callBudget.used++;
        pageCalls++;

        if (!jobs) {
            // null = rate-limited / budget exhausted / API error.
            aborted = true;
            break;
        }

        if (jobs.length === 0) break;

        for (const job of jobs) {
            const jobKey = job.url || job.id;
            if (seenUrls.has(jobKey)) continue;
            seenUrls.add(jobKey);

            out.push({
                externalId: `fantasticjobs-${job.source || 'unknown'}-${job.id}`,
                title: job.title,
                company: job.organization || 'Unknown',
                location: formatLocation(job),
                description: job.description || '',
                applyLink: job.url,
                job_type: mapEmploymentType(job),
                postedDate: job.date_posted || job.date_created || undefined,
                sourceSite: job.source,
            });
        }

        hasMore = jobs.length === PAGE_SIZE;
        offset += PAGE_SIZE;

        // Rate-limit the next page request via the shared RateLimiter.
        // Pacing is 1 req/sec — well below the published 5 req/sec cap,
        // and well below any plausible sliding-window enforcement. The
        // 2026-04-30 diagnostic showed 350ms produced sporadic 429s.
        await pageRateLimiter.throttle();
    }

    const found = out.length - initialOut;
    console.log(`[Fantastic-Jobs-DB] PASS "${label}": +${found} (cumulative ${out.length}) using ${pageCalls} API calls${aborted ? ' [ABORTED]' : ''}`);
    return { label, jobsFound: found, apiCalls: pageCalls, aborted };
}

export interface FantasticJobsFetchOptions {
    /**
     * Time-window endpoint to query.
     *   '7d' (default) — jobs posted in the last 7 days. Right for the
     *     scheduled cron since it runs 2x/day and 7d > worst-case skip.
     *   '6m' — jobs posted in the last 6 months. Used for ONE-SHOT backfill
     *     only. The job-normalizer's 90-day staleness filter (line 519,
     *     non-ATS sources) already rejects rows older than 90 days, so a
     *     6m fetch effectively becomes a 90-day backfill.
     */
    endpoint?: '7d' | '6m';
}

export async function fetchFantasticJobsDbJobs(
    opts: FantasticJobsFetchOptions = {},
): Promise<FantasticJobOutput[]> {
    if (!RAPIDAPI_KEY) {
        console.error('[Fantastic-Jobs-DB] RAPIDAPI_KEY env var is not set. Skipping.');
        return [];
    }
    resetDiag();

    const endpointKey = opts.endpoint ?? '7d';
    const endpointUrl = endpointKey === '6m' ? ENDPOINT_6M : ENDPOINT_7D;

    console.log(`[Fantastic-Jobs-DB] endpoint=${endpointKey} — running 2-pass probe-validated strategy${endpointKey === '6m' ? ' (BACKFILL MODE)' : ''}`);

    const allJobs: FantasticJobOutput[] = [];
    const seenUrls = new Set<string>();
    const callBudget = { used: 0, cap: MAX_REQUESTS_PER_RUN };
    const pageRateLimiter = new RateLimiter(FANTASTIC_PAGE_RATE_LIMIT_MS);

    // Cooldown buffer at run start.
    await sleep(1000);

    // ── PASS A: per-term title loop ──────────────────────────────────────
    // The API doesn't accept OR in title_filter — verified via probe
    // 2026-04-30. Each term is a separate paginated query.
    for (const titleFilter of TITLE_TERMS) {
        if (callBudget.used >= callBudget.cap) break;
        await runPass(
            `title: ${titleFilter}`,
            { title_filter: titleFilter },
            allJobs,
            seenUrls,
            callBudget,
            endpointUrl,
            pageRateLimiter,
        );
        await sleep(FANTASTIC_FILTER_GAP_MS);
    }

    // ── PASS B: description_filter widener ───────────────────────────────
    // Catches generic-titled jobs (Nurse Practitioner / APRN) where
    // descriptions name psychiatric work. description_filter DOES support
    // OR — verified via probe.
    for (const titleFilter of TITLE_FILTERS_BROAD) {
        if (callBudget.used >= callBudget.cap) break;
        await runPass(
            `desc: ${titleFilter}`,
            {
                title_filter: titleFilter,
                description_filter: DESCRIPTION_FILTER_PSYCH,
            },
            allJobs,
            seenUrls,
            callBudget,
            endpointUrl,
            pageRateLimiter,
        );
        await sleep(FANTASTIC_FILTER_GAP_MS);
    }

    console.log(`[Fantastic-Jobs-DB] Total: ${allJobs.length} jobs (${callBudget.used} API calls used out of ${callBudget.cap} budget, endpoint=${endpointKey})`);
    return allJobs;
}

import type { Aggregator, RawJobData, FetchOptions } from './types';
import { checkJobHealth, type HealthDecision } from '@/lib/health/check-job-health';

export const fantasticJobsDbAggregator: Aggregator = {
    key: 'fantastic-jobs-db',
    chunkCount: 1,
    async fetch(opts: FetchOptions = {}): Promise<RawJobData[]> {
        return (await fetchFantasticJobsDbJobs({ endpoint: opts.endpoint })) as unknown as RawJobData[];
    },
    async probeJob(externalId: string, applyLink: string): Promise<HealthDecision | null> {
        // Apply links here point at the underlying ATS (greenhouse,
        // lever, etc.). checkJobHealth's source dispatch detects the
        // host pattern and routes to the right native probe.
        return checkJobHealth(applyLink, 'fantastic-jobs-db', { externalId });
    },
};
