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

// ── Search Strategy (refactored 2026-04-30) ──────────────────────────────
// Old approach: 26 separate `title_filter` calls (one per phrase). 99%+
// overlap → wasted API calls. Capped runs at ~22 adds / 7 days.
//
// New approach: three small passes that each catch a different shape of
// PMHNP listing the catalog was missing.
//   PASS 1 — advanced_title_filter (OR'd) for explicit psychiatric titles
//   PASS 2 — description_filter for "Nurse Practitioner" / "APRN" titles
//            where the description names psychiatric / mental health work
//   PASS 3 — fallback: legacy single-term loop, kept as a safety net in
//            case the API rejects advanced_title_filter for our plan tier
// Dedup across passes via seenUrls (Set).
//
// Boolean syntax inferred from the Apify-side docs of the same dataset:
//   `OR` (uppercase), parentheses for grouping, double-quotes for phrases.
// If the API returns HTTP 400 for a syntax we send, the pass logs and
// continues — the next pass picks up.

const ADVANCED_TITLE_OR = [
    '"PMHNP"',
    '"PMHNP-BC"',
    '"Psychiatric Nurse Practitioner"',
    '"Psychiatric Mental Health Nurse Practitioner"',
    '"Mental Health Nurse Practitioner"',
    '"Behavioral Health Nurse Practitioner"',
    '"Psych NP"',
    '"Psychiatric NP"',
    '"Mental Health NP"',
    '"Behavioral Health NP"',
    '"Psychiatric APRN"',
    '"Mental Health APRN"',
    '"Psychiatric Prescriber"',
    '"Telepsychiatry"',
    '"Telepsych"',
].join(' OR ');

// Description-side widening: any title that contains "Nurse Practitioner"
// or "APRN" or "NP" — but only if the description names psychiatric work.
const TITLE_FILTERS_BROAD = [
    'Nurse Practitioner',
    'APRN',
];
const DESCRIPTION_FILTER_PSYCH = '"psychiatric" OR "mental health" OR "PMHNP" OR "psychiatry"';

// Legacy single-term list, used only by the fallback pass if advanced
// filtering fails. Kept compact — broader terms covered by description
// filter above.
const TITLE_FILTERS_FALLBACK = [
    'PMHNP',
    'Psychiatric Nurse Practitioner',
    'Mental Health Nurse Practitioner',
    'Telepsychiatry',
];

// ── Budget Protection ──
// Ultra plan: 20,000 requests/month, 5 req/sec
// New approach uses ~30-50 calls/run × 2 runs/day × 30d ≈ 3,000 (well within)
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

// Quality filters for the EXPERIMENTAL passes. Trying these in passes
// 1+2 to see if the API supports them. If they're rejected (Discord-
// observed fetch=0 across all passes after 2026-04-30 trigger), the
// fallback pass below ignores them so we always get a working baseline.
const QUALITY_FILTERS: Record<string, string> = {
    // Skip recruitment / staffing agencies. Docs ('removeAgency') confirm
    // it but the param name might be different on the RapidAPI version
    // (could also be 'remove_agency' or 'agency_filter').
    remove_agency: 'true',
    // Plain text descriptions (smaller payload).
    description_type: 'text',
    // Whitelist high-quality ATS platforms.
    ats: 'greenhouse,lever,workday,ashby,paylocity,smartrecruiters,bamboohr,jobvite,icims,paycom,ukg,adp',
};

// Required for every pass.
const BASE_FILTERS: Record<string, string> = {
    location_filter: 'United States',
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
): Promise<FantasticJobApiResponse[] | null> {
    const params = new URLSearchParams({
        limit: PAGE_SIZE.toString(),
        offset: offset.toString(),
        ...BASE_FILTERS,
        ...extraParams,
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

        // Diagnostics — capture the first response so we can dump it to
        // Discord if the run produces zero rows.
        const statusKey = String(res.status);
        runDiag.statusCounts[statusKey] = (runDiag.statusCounts[statusKey] ?? 0) + 1;
        if (runDiag.firstResponseStatus === null) {
            runDiag.firstResponseStatus = res.status;
            runDiag.firstResponseUrl = url.replace(RAPIDAPI_KEY ?? '', 'XXX');
        }

        if (res.status === 429) {
            // Honor Retry-After if present, else default to 3s. Try ONCE
            // more — repeated 429 means we're saturating the quota and
            // should abort the pass rather than burn budget.
            const retryAfterRaw = res.headers.get('retry-after');
            const retryAfterSec = retryAfterRaw ? parseInt(retryAfterRaw, 10) : 3;
            const waitMs = Math.max(1000, (Number.isFinite(retryAfterSec) ? retryAfterSec : 3) * 1000);
            console.warn(`[Fantastic-Jobs-DB] 429 rate-limited. Waiting ${waitMs}ms then retrying once.`);
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

async function runPass(
    label: string,
    extraParams: Record<string, string>,
    out: FantasticJobOutput[],
    seenUrls: Set<string>,
    callBudget: { used: number; cap: number },
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
        const jobs = await fetchPage(extraParams, offset);
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
                source_ats: job.source,
            });
        }

        hasMore = jobs.length === PAGE_SIZE;
        offset += PAGE_SIZE;

        // Rate limiting — Ultra plan claims 5 req/sec but we observed 429s
        // at 200ms spacing (= exactly 5/sec, zero margin). Bumped to 350ms
        // (≈2.8 req/sec) so timing jitter, key-shared concurrent triggers,
        // or burst windows don't trip the quota. Ultra plan budget is
        // 20k req/month so we can afford the slower cadence.
        await sleep(350);
    }

    const found = out.length - initialOut;
    console.log(`[Fantastic-Jobs-DB] PASS "${label}": +${found} (cumulative ${out.length}) using ${pageCalls} API calls${aborted ? ' [ABORTED]' : ''}`);
    return { label, jobsFound: found, apiCalls: pageCalls, aborted };
}

export async function fetchFantasticJobsDbJobs(): Promise<FantasticJobOutput[]> {
    if (!RAPIDAPI_KEY) {
        console.error('[Fantastic-Jobs-DB] RAPIDAPI_KEY env var is not set. Skipping.');
        return [];
    }
    resetDiag();

    console.log(`[Fantastic-Jobs-DB] Searching across 120K+ orgs for PMHNP jobs (3-pass strategy)...`);

    const allJobs: FantasticJobOutput[] = [];
    const seenUrls = new Set<string>();
    const callBudget = { used: 0, cap: MAX_REQUESTS_PER_RUN };

    // Cooldown buffer at the start of the run. Two consecutive admin
    // triggers can collide on the API's per-second window — giving 1s
    // of breathing room here means the second trigger won't inherit the
    // first's saturated quota.
    await sleep(1000);

    // ── PASS 1: advanced_title_filter + experimental quality filters ─────
    const pass1 = await runPass(
        'advanced_title_filter+quality',
        { advanced_title_filter: ADVANCED_TITLE_OR, ...QUALITY_FILTERS },
        allJobs,
        seenUrls,
        callBudget,
    );

    await sleep(1000);

    // ── PASS 2: description_filter + quality filters ─────────────────────
    if (callBudget.used < callBudget.cap) {
        for (const titleFilter of TITLE_FILTERS_BROAD) {
            if (callBudget.used >= callBudget.cap) break;
            await runPass(
                `desc-pass: ${titleFilter}`,
                {
                    title_filter: titleFilter,
                    description_filter: DESCRIPTION_FILTER_PSYCH,
                    ...QUALITY_FILTERS,
                },
                allJobs,
                seenUrls,
                callBudget,
            );
            await sleep(2000);
        }
    }

    // ── PASS 3: legacy single-term fallback — NO quality filters, NO
    //     advanced syntax. Mirrors exactly what worked before today's
    //     refactor. Always fires when the count from passes 1+2 is zero,
    //     so we always have a working baseline if any new param is
    //     rejected by the API tier.
    if (allJobs.length === 0 && callBudget.used < callBudget.cap) {
        console.warn('[Fantastic-Jobs-DB] Passes 1+2 returned 0 — falling back to per-term legacy loop without experimental filters');
        for (const titleFilter of TITLE_FILTERS_FALLBACK) {
            if (callBudget.used >= callBudget.cap) break;
            await runPass(
                `fallback: ${titleFilter}`,
                { title_filter: titleFilter },
                allJobs,
                seenUrls,
                callBudget,
            );
            await sleep(2000);
        }
    }

    console.log(`[Fantastic-Jobs-DB] Total: ${allJobs.length} jobs (${callBudget.used} API calls used out of ${callBudget.cap} budget)`);
    return allJobs;
}
