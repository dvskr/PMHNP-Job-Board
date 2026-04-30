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

// Common quality filters applied to every pass. Tightens the funnel so
// each fetched row has a higher chance of becoming a catalog add.
const COMMON_FILTERS: Record<string, string> = {
    location_filter: 'United States',
    // Skip recruitment / staffing agencies — they post duplicates of
    // direct-employer roles and pollute employer dedup. Documented param
    // on Apify-side; harmless if the RapidAPI tier ignores it.
    remove_agency: 'true',
    // Plain text descriptions (smaller payload, easier downstream cleaning).
    description_type: 'text',
    // Whitelist high-quality ATS platforms. The free-form career-page
    // scrapes from unknown ATS providers tend to be lower-quality and
    // we already ingest most direct ATS sources separately.
    ats: 'greenhouse,lever,workday,ashby,paylocity,smartrecruiters,bamboohr,jobvite,icims,paycom,ukg,adp',
};

async function fetchPage(
    extraParams: Record<string, string>,
    offset: number,
): Promise<FantasticJobApiResponse[] | null> {
    const params = new URLSearchParams({
        limit: PAGE_SIZE.toString(),
        offset: offset.toString(),
        ...COMMON_FILTERS,
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

        if (res.status === 429) {
            console.warn('[Fantastic-Jobs-DB] Rate limited — stopping.');
            return null;
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

        // Rate limiting — Ultra plan: 5 req/sec
        await sleep(200);
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

    console.log(`[Fantastic-Jobs-DB] Searching across 120K+ orgs for PMHNP jobs (3-pass strategy)...`);

    const allJobs: FantasticJobOutput[] = [];
    const seenUrls = new Set<string>();
    const callBudget = { used: 0, cap: MAX_REQUESTS_PER_RUN };

    // ── PASS 1: advanced_title_filter (consolidated OR'd terms) ──────────
    const pass1 = await runPass(
        'advanced_title_filter',
        { advanced_title_filter: ADVANCED_TITLE_OR },
        allJobs,
        seenUrls,
        callBudget,
    );

    await sleep(1000);

    // ── PASS 2: description_filter — Nurse Practitioner / APRN titles
    //     where description mentions psychiatric / mental health work ────
    if (callBudget.used < callBudget.cap) {
        for (const titleFilter of TITLE_FILTERS_BROAD) {
            if (callBudget.used >= callBudget.cap) break;
            await runPass(
                `desc-pass: ${titleFilter}`,
                {
                    title_filter: titleFilter,
                    description_filter: DESCRIPTION_FILTER_PSYCH,
                },
                allJobs,
                seenUrls,
                callBudget,
            );
            await sleep(1000);
        }
    }

    // ── PASS 3: legacy single-term fallback (only if pass 1 returned 0
    //     — protects us if advanced_title_filter is rejected at our tier) ─
    if (pass1.jobsFound === 0 && callBudget.used < callBudget.cap) {
        console.warn('[Fantastic-Jobs-DB] PASS 1 returned 0 — falling back to per-term loop');
        for (const titleFilter of TITLE_FILTERS_FALLBACK) {
            if (callBudget.used >= callBudget.cap) break;
            await runPass(
                `fallback: ${titleFilter}`,
                { title_filter: titleFilter },
                allJobs,
                seenUrls,
                callBudget,
            );
            await sleep(1000);
        }
    }

    console.log(`[Fantastic-Jobs-DB] Total: ${allJobs.length} jobs (${callBudget.used} API calls used out of ${callBudget.cap} budget)`);
    return allJobs;
}
