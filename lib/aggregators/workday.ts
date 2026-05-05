/**
 * Workday Direct Scraper
 *
 * Scrapes Workday career sites directly via their hidden JSON API.
 * Each employer has a POST endpoint at:
 *   https://{slug}.wd{instance}.myworkdayjobs.com/wday/cxs/{slug}/{site}/jobs
 *
 * No API key required. Free and unlimited.
 *
 * Tenant list lives in tenants/workday.ts so the adapter stays focused
 * on fetch/pagination logic.
 */

import { WORKDAY_TENANTS, type WorkdayTenant } from './tenants/workday';
type WorkdayCompany = WorkdayTenant;
const WORKDAY_COMPANIES: readonly WorkdayCompany[] = WORKDAY_TENANTS;

interface WorkdayJobPosting {
    title: string;
    externalPath: string;
    locationsText: string;
    postedOn: string;
    bulletFields: string[];
    subtitles: Array<{ instances: string[] }>;
}

interface WorkdaySearchResponse {
    total: number;
    jobPostings: WorkdayJobPosting[];
}

export interface WorkdayJobRaw {
    externalId: string;
    title: string;
    company: string;
    location: string;
    description: string;
    applyLink: string;
    postedDate?: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse "Posted X Days Ago" text from Workday into a real Date
 */
function parsePostedAgoText(text: string): string | undefined {
    if (!text) return undefined;
    const lower = text.toLowerCase().trim();

    // "posted today" or "posted 0 days ago"
    if (lower.includes('today') || lower === 'posted 0 days ago') {
        return new Date().toISOString();
    }

    // "posted 7 days ago", "posted 30+ days ago"
    const daysMatch = lower.match(/(\d+)\+?\s*days?\s*ago/);
    if (daysMatch) {
        const daysAgo = parseInt(daysMatch[1], 10);
        const date = new Date();
        date.setDate(date.getDate() - daysAgo);
        return date.toISOString();
    }

    // "posted 1 month ago", "posted 2 months ago"
    const monthsMatch = lower.match(/(\d+)\+?\s*months?\s*ago/);
    if (monthsMatch) {
        const monthsAgo = parseInt(monthsMatch[1], 10);
        const date = new Date();
        date.setMonth(date.getMonth() - monthsAgo);
        return date.toISOString();
    }

    return undefined;
}

/**
 * Fetch job description AND real posted date from the Workday job detail endpoint
 * The detail endpoint returns jobPostingInfo which has the real "Posted X Days Ago" text
 */
async function fetchJobDetails(company: WorkdayCompany, externalPath: string): Promise<{ description: string; realPostedDate?: string }> {
    const url = `https://${company.slug}.wd${company.instance}.myworkdayjobs.com/wday/cxs/${company.slug}/${company.site}${externalPath}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) return { description: '' };

        const data = await res.json();
        const info = data?.jobPostingInfo;
        const description = info?.jobDescription || '';

        // Extract the REAL original posting date from the detail endpoint
        // Priority: startDate (exact ISO date "2026-03-05") > postedOn ("Posted 7 Days Ago")
        let realPostedDate: string | undefined;

        // 1. Try startDate first — exact date from Workday
        if (info?.startDate) {
            const d = new Date(info.startDate);
            if (!isNaN(d.getTime())) {
                realPostedDate = d.toISOString();
            }
        }

        // 2. Fallback: parse relative "Posted X Days Ago" text
        if (!realPostedDate && info?.postedOn) {
            realPostedDate = parsePostedAgoText(info.postedOn);
        }

        return { description, realPostedDate };
    } catch {
        return { description: '' };
    }
}

/**
 * Search for PMHNP jobs on a specific Workday company site
 */
async function fetchCompanyJobs(company: WorkdayCompany): Promise<WorkdayJobRaw[]> {
    const baseUrl = `https://${company.slug}.wd${company.instance}.myworkdayjobs.com/wday/cxs/${company.slug}/${company.site}/jobs`;
    const applyBase = `https://${company.slug}.wd${company.instance}.myworkdayjobs.com/en-US/${company.site}`;

    // PMHNP search terms - cast a wide net, let isRelevantJob filter precisely
    const searchTerms = [
        'Psychiatric Nurse Practitioner',
        'PMHNP',
        'Psychiatric Mental Health',
        'Behavioral Health Nurse Practitioner',
        'Psychiatric APRN',
        'Psych NP',
    ];

    const allJobs: WorkdayJobRaw[] = [];
    const seenPaths = new Set<string>();

    for (const searchText of searchTerms) {
        let offset = 0;
        const limit = 20;
        let hasMore = true;

        while (hasMore) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000);

                const res = await fetch(baseUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        limit,
                        offset,
                        searchText,
                    }),
                    signal: controller.signal,
                });

                clearTimeout(timeout);

                if (!res.ok) {
                    console.warn(`[Workday] ${company.name}: HTTP ${res.status} for "${searchText}"`);
                    break;
                }

                const data: WorkdaySearchResponse = await res.json();
                const postings = data.jobPostings || [];
                const total = data.total || 0;

                if (postings.length === 0) break;

                for (const posting of postings) {
                    // Skip already seen (different search terms may find same job)
                    if (seenPaths.has(posting.externalPath)) continue;
                    seenPaths.add(posting.externalPath);

                    // Extract job ID from external path: /job/Title-Here/JR123456
                    const pathParts = posting.externalPath.split('/');
                    const jobId = pathParts[pathParts.length - 1] || posting.externalPath;

                    // Quick title pre-filter before fetching description
                    const titleLower = posting.title.toLowerCase();
                    const likelyPMHNP = titleLower.includes('pmhnp') ||
                        titleLower.includes('psychiatric') ||
                        titleLower.includes('psych') ||
                        titleLower.includes('mental health') ||
                        titleLower.includes('behavioral health') ||
                        titleLower.includes('nurse practitioner');

                    if (!likelyPMHNP) continue;

                    // Fetch the full job description AND real posted date
                    const details = await fetchJobDetails(company, posting.externalPath);
                    await sleep(200); // Be polite

                    // Prioritize the real date from detail endpoint, then fall back to
                    // search API's postedOn (same "Posted X Days Ago" text, available on every listing)
                    const postedDate = details.realPostedDate
                        || parsePostedAgoText(posting.postedOn)
                        || undefined;
                    allJobs.push({
                        externalId: `workday-${company.slug}-${jobId}`,
                        title: posting.title,
                        company: company.name,
                        location: posting.locationsText || 'United States',
                        description: details.description,
                        applyLink: `${applyBase}${posting.externalPath}`,
                        postedDate,
                    });
                }

                offset += limit;
                hasMore = offset < total && postings.length === limit;

                // Rate limiting between pages
                await sleep(300);
            } catch (error) {
                console.warn(`[Workday] ${company.name}: Error fetching "${searchText}" at offset ${offset}:`, error);
                break;
            }
        }

        // Rate limiting between search terms
        await sleep(500);
    }

    console.log(`[Workday] ${company.name}: ${allJobs.length} PMHNP jobs found (${seenPaths.size} total searched)`);
    return allJobs;
}

/**
 * Total number of chunks for Workday (~95 companies / ~19 per chunk = 5)
 */
export const WORKDAY_TOTAL_CHUNKS = 5;
const WORKDAY_CHUNK_SIZE = Math.ceil(WORKDAY_COMPANIES.length / WORKDAY_TOTAL_CHUNKS);

/**
 * Fetch PMHNP jobs from Workday companies (supports chunked execution)
 * @param options.chunk - Chunk index (0-4). If omitted, processes all companies.
 */
export async function fetchWorkdayJobs(options?: { chunk?: number }): Promise<WorkdayJobRaw[]> {
    let companies = WORKDAY_COMPANIES;

    // Support chunked execution for Vercel cron timeout limits
    if (options?.chunk !== undefined) {
        const start = options.chunk * WORKDAY_CHUNK_SIZE;
        const end = start + WORKDAY_CHUNK_SIZE;
        companies = WORKDAY_COMPANIES.slice(start, end);
        console.log(`[Workday] Chunk ${options.chunk}/${WORKDAY_TOTAL_CHUNKS - 1}: Processing companies ${start + 1}-${Math.min(end, WORKDAY_COMPANIES.length)} of ${WORKDAY_COMPANIES.length}`);
    }

    console.log(`[Workday] Checking ${companies.length} Workday career sites for PMHNP jobs...`);

    const allJobs: WorkdayJobRaw[] = [];
    const failedCompanies: string[] = [];
    const BATCH_SIZE = 5;

    try {
        for (let i = 0; i < companies.length; i += BATCH_SIZE) {
            const batch = companies.slice(i, i + BATCH_SIZE);

            const results = await Promise.allSettled(
                batch.map(company => fetchCompanyJobs(company))
            );

            for (let j = 0; j < results.length; j++) {
                const result = results[j];
                if (result.status === 'fulfilled') {
                    allJobs.push(...result.value);
                } else {
                    failedCompanies.push(batch[j].name);
                    console.error(`[Workday] Failed to fetch from ${batch[j].name}`);
                }
            }

            if (i + BATCH_SIZE < companies.length) {
                await sleep(300);
            }
        }

        console.log(`[Workday] Total PMHNP jobs fetched: ${allJobs.length}`);

        if (failedCompanies.length > 0) {
            console.log(`[Workday] Failed companies (${failedCompanies.length}): ${failedCompanies.join(', ')}`);
        }

        return allJobs;
    } catch (error) {
        console.error('[Workday] Error in main fetch:', error);
        return allJobs;
    }
}
