/**
 * Health eCareer Center adapter — Naylor-powered association job board.
 *
 * Endpoint: https://jobs.healthcareercenter.com/jobs/search?keywords={q}&page={N}
 *
 * Why this adapter:
 *   - This is the shared underlying platform behind multiple healthcare
 *     association career pages (APNA, AHIMA, AAACN, etc.). Hitting the
 *     shared root gives broader coverage than any single association's
 *     filtered view.
 *   - Search results are server-rendered HTML with stable
 *     `<a href="/jobs/{id}/{slug}">` patterns we can extract via regex.
 *   - Each detail page embeds a full `application/ld+json` JobPosting
 *     with structured title, description, hiringOrganization,
 *     jobLocation, baseSalary, employmentType, datePosted, validThrough.
 *
 * AANP was attempted but is gated behind a Cloudflare bot challenge
 * (`<title>Just a moment...</title>` on /jobs/rss). Not feasible
 * without a stealth headless browser; skipped.
 *
 * Volume: PMHNP keyword filter returns ~5-9 pages × 25 results = ~125-225
 * candidates per cron run. After dedup against direct ATS sources, net
 * new is ~30-80/month.
 */

import { isRelevantJob } from '@/lib/utils/job-filter';
import type { Aggregator, RawJobData } from './types';
import { checkJobHealth, type HealthDecision } from '@/lib/health/check-job-health';
import { htmlToReadableText } from '@/lib/sanitize';

const HCC_BASE = 'https://jobs.healthcareercenter.com';
const QUERIES: readonly string[] = [
    'PMHNP',
    'psychiatric mental health nurse practitioner',
    'psychiatric nurse practitioner',
    'mental health nurse practitioner',
    'behavioral health nurse practitioner',
];

const TIME_BUDGET_MS = 180_000; // under orchestrator MAX_INGESTION_MS (240s) so the insert loop has headroom
const MAX_PAGES_PER_QUERY = 10;
const PAGE_GAP_MS = 400;
const DETAIL_GAP_MS = 250;
const REQUEST_TIMEOUT_MS = 12_000;

const BROWSER_HEADERS: HeadersInit = {
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
};

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract unique `/jobs/{numeric-id}` ids from a search-result HTML page. */
function extractJobIds(html: string): string[] {
    const ids = new Set<string>();
    const re = /\/jobs\/(\d{6,12})(?=["'/?#])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        ids.add(m[1]);
    }
    return [...ids];
}

interface JobPostingLd {
    '@type'?: string;
    title?: string;
    description?: string;
    datePosted?: string;
    validThrough?: string;
    url?: string;
    employmentType?: string;
    hiringOrganization?: { name?: string };
    jobLocation?: {
        address?: {
            addressLocality?: string;
            addressRegion?: string;
            addressCountry?: string;
        };
    };
    baseSalary?: {
        value?: { value?: string | number };
    };
}

/**
 * Parse the first JobPosting JSON-LD block from a detail-page HTML.
 * Returns null if not found or unparseable.
 */
function extractJobPosting(html: string): JobPostingLd | null {
    const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const raw = m[1].trim();
        try {
            const json = JSON.parse(raw);
            if (json && typeof json === 'object' && (json['@type'] === 'JobPosting' || (Array.isArray(json['@type']) && json['@type'].includes('JobPosting')))) {
                return json as JobPostingLd;
            }
        } catch {
            // ignore parse failure, try next block
        }
    }
    return null;
}

function buildLocation(post: JobPostingLd): string {
    const addr = post.jobLocation?.address;
    if (addr) {
        const city = addr.addressLocality?.trim();
        const state = addr.addressRegion?.trim();
        if (city && state) return `${city}, ${state}`;
        if (state) return state;
        if (city) return city;
    }
    return 'United States';
}

function mapEmploymentType(t?: string): string | null {
    if (!t) return null;
    const u = t.toUpperCase();
    if (u === 'FULL_TIME' || u === 'FULLTIME') return 'Full-Time';
    if (u === 'PART_TIME' || u === 'PARTTIME') return 'Part-Time';
    if (u === 'CONTRACTOR' || u === 'CONTRACT' || u === 'TEMPORARY') return 'Contract';
    if (u === 'INTERN') return 'Internship';
    return null;
}

function stripHtml(s: string): string {
    return htmlToReadableText(s);
}

async function fetchOne(url: string): Promise<{ status: number; body: string }> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: controller.signal, headers: BROWSER_HEADERS });
        const body = await res.text();
        return { status: res.status, body };
    } finally {
        clearTimeout(t);
    }
}

async function fetchDetail(jobId: string): Promise<JobPostingLd | null> {
    try {
        const { status, body } = await fetchOne(`${HCC_BASE}/jobs/${jobId}`);
        if (status !== 200) return null;
        return extractJobPosting(body);
    } catch {
        return null;
    }
}

export async function fetchHealthCareerCenterJobs(): Promise<RawJobData[]> {
    const startTime = Date.now();
    const out: RawJobData[] = [];
    const seen = new Set<string>();

    console.log(`[HCC] Starting search across ${QUERIES.length} keyword variants...`);

    queryLoop: for (const q of QUERIES) {
        for (let page = 1; page <= MAX_PAGES_PER_QUERY; page++) {
            if (Date.now() - startTime > TIME_BUDGET_MS) {
                console.warn(`[HCC] Time budget exhausted at "${q}" page ${page}`);
                break queryLoop;
            }
            try {
                const url = `${HCC_BASE}/jobs/search?keywords=${encodeURIComponent(q)}&page=${page}`;
                const { status, body } = await fetchOne(url);
                if (status !== 200) {
                    console.warn(`[HCC] HTTP ${status} for "${q}" page ${page}`);
                    break;
                }
                const ids = extractJobIds(body).filter((id) => !seen.has(id));
                console.log(`[HCC] "${q}" page ${page}: ${ids.length} new job ids`);
                if (ids.length === 0) break; // pagination exhausted

                for (const id of ids) {
                    seen.add(id);
                    if (Date.now() - startTime > TIME_BUDGET_MS) {
                        console.warn(`[HCC] Time budget hit during detail fetches`);
                        break queryLoop;
                    }
                    const post = await fetchDetail(id);
                    if (!post || !post.title) continue;
                    // Title-only relevance gate — orchestrator does title+desc too.
                    if (!isRelevantJob(post.title, '')) continue;
                    const description = stripHtml(post.description ?? '');
                    const applyLink = post.url ?? `${HCC_BASE}/jobs/${id}`;
                    out.push({
                        externalId: `hcc-${id}`,
                        title: post.title,
                        company: post.hiringOrganization?.name || 'Company Not Listed',
                        employer: post.hiringOrganization?.name || 'Company Not Listed',
                        location: buildLocation(post),
                        description,
                        applyLink,
                        postedDate: post.datePosted,
                        postedAt: post.datePosted,
                        jobType: mapEmploymentType(post.employmentType) ?? undefined,
                        sourceProvider: 'healthcareercenter',
                        sourceSite: 'healthcareercenter',
                    } as RawJobData);
                    await sleep(DETAIL_GAP_MS);
                }
            } catch (err) {
                console.warn(`[HCC] Error on "${q}" page ${page}:`, err);
                break;
            }
            await sleep(PAGE_GAP_MS);
        }
    }

    console.log(`[HCC] Total: ${out.length} PMHNP-relevant jobs from ${seen.size} detail fetches`);
    return out;
}

export const healthCareerCenterAggregator: Aggregator = {
    key: 'healthcareercenter',
    chunkCount: 1,
    async fetch(): Promise<RawJobData[]> {
        return fetchHealthCareerCenterJobs();
    },
    async probeJob(externalId: string, applyLink: string): Promise<HealthDecision | null> {
        return checkJobHealth(applyLink, 'healthcareercenter', { externalId });
    },
};
