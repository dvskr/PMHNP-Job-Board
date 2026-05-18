/**
 * JazzHR adapter — HTML scrape of the public board.
 *
 * JazzHR (applytojob.com) has no public JSON API. The board HTML at
 * https://{slug}.applytojob.com/ embeds /apply/{id}/{title-slug} links
 * that we extract with a single regex. We then fetch each job's detail
 * page to get the description.
 *
 * Why HTML scrape:
 *   - the JSON-LD block on the board page only contains the
 *     Organization, not the JobPosting list
 *   - the jobs.json / feed.json endpoints return 404
 *   - the rendered HTML is stable Server-Side HTML (not SPA), so a
 *     simple regex is reliable
 *
 * Resilience: per-job detail-fetch failures are non-fatal (we just
 * fall back to the title-derived slug). A failed board fetch yields
 * zero jobs for that tenant.
 *
 * Tenants in lib/aggregators/tenants/jazzhr.ts.
 */

import { isRelevantJob } from '@/lib/utils/job-filter';
import { JAZZHR_TENANTS } from './tenants/jazzhr';
import type { Aggregator, RawJobData } from './types';
import { checkJobHealth, type HealthDecision } from '@/lib/health/check-job-health';
import { htmlToReadableText } from '@/lib/sanitize';

const TIME_BUDGET_MS = 240_000;
const TENANT_GAP_MS = 500;
const DETAIL_FETCH_GAP_MS = 200;
const BATCH_SIZE = 3;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse board HTML for job IDs + slug-titles.
 * Returns one entry per unique /apply/{id}/{title-slug} link.
 * Filters out paths like /apply/confirm/ and /apply/jobs.js.
 */
function extractJobsFromBoardHtml(html: string): Array<{ id: string; titleSlug: string }> {
    const out: Array<{ id: string; titleSlug: string }> = [];
    const seen = new Set<string>();
    // Match /apply/{8-12 alphanumerics}/{slug-with-hyphens}
    const re = /\/apply\/([A-Za-z0-9]{6,16})\/([A-Za-z0-9-]{3,200})(?=["'?#/])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const id = m[1];
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ id, titleSlug: m[2] });
    }
    return out;
}

/**
 * Convert a JazzHR slug-title like "Psychiatric-Nurse-Practitioner-PMHNP"
 * into a human-readable title. Best-effort — board listings sometimes
 * have richer phrasing than the URL slug, but the slug captures the
 * essential keywords for the relevance pre-filter.
 */
function humanizeTitleSlug(s: string): string {
    return s
        .replace(/-+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

interface JazzHrJobShape {
    title: string;
    id: string;
    titleSlug: string;
    applyLink: string;
    description?: string;
    location?: string;
}

async function fetchDetailDescription(slug: string, jobId: string, titleSlug: string): Promise<{ description: string; locationGuess: string | null }> {
    const url = `https://${slug}.applytojob.com/apply/${jobId}/${titleSlug}`;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 PMHNP-Hiring-Aggregator' },
        });
        clearTimeout(timeout);
        if (!res.ok) return { description: '', locationGuess: null };
        const html = await res.text();
        // The job description block is wrapped in a #job-description
        // div on JazzHR detail pages. Fall back to all visible text
        // between the header and footer markers if the structured div
        // isn't found.
        const descMatch = /<div[^>]*id=["']job-description["'][^>]*>([\s\S]*?)<\/div>/.exec(html);
        const description = descMatch ? htmlToReadableText(descMatch[1]) : '';
        // Location often appears in a meta block on detail pages.
        const locMatch = /<li[^>]*class=["'][^"']*location[^"']*["'][^>]*>([^<]+)</.exec(html);
        const locationGuess = locMatch ? locMatch[1].trim() : null;
        return { description, locationGuess };
    } catch {
        return { description: '', locationGuess: null };
    }
}

async function fetchTenantJobs(tenant: { slug: string; name: string }): Promise<RawJobData[]> {
    const boardUrl = `https://${tenant.slug}.applytojob.com/`;
    const out: RawJobData[] = [];
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12_000);
        const res = await fetch(boardUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 PMHNP-Hiring-Aggregator' },
        });
        clearTimeout(timeout);

        if (!res.ok) {
            console.warn(`[JazzHR] ${tenant.name} (${tenant.slug}): board HTTP ${res.status}`);
            return out;
        }
        const html = await res.text();
        const jobs = extractJobsFromBoardHtml(html);

        // Pre-filter by titleSlug to avoid wasting detail fetches on
        // irrelevant jobs. JazzHR boards often have dozens of non-NP
        // postings (counselors, therapists, admin) we'd reject anyway.
        const candidates: JazzHrJobShape[] = [];
        for (const j of jobs) {
            const guessedTitle = humanizeTitleSlug(j.titleSlug);
            if (!isRelevantJob(guessedTitle, '')) continue;
            candidates.push({
                title: guessedTitle,
                id: j.id,
                titleSlug: j.titleSlug,
                applyLink: `https://${tenant.slug}.applytojob.com/apply/${j.id}/${j.titleSlug}`,
            });
        }

        // Fetch detail pages for description / location.
        for (const c of candidates) {
            const detail = await fetchDetailDescription(tenant.slug, c.id, c.titleSlug);
            c.description = detail.description;
            c.location = detail.locationGuess ?? undefined;
            await sleep(DETAIL_FETCH_GAP_MS);
        }

        for (const c of candidates) {
            out.push({
                externalId: `jazzhr-${tenant.slug}-${c.id}`,
                title: c.title,
                company: tenant.name,
                employer: tenant.name,
                location: c.location ?? 'United States',
                description: c.description ?? '',
                applyLink: c.applyLink,
                sourceProvider: 'jazzhr',
                sourceSite: 'jazzhr',
            } as RawJobData);
        }
        console.log(`[JazzHR] ${tenant.name}: ${out.length} PMHNP-relevant of ${jobs.length} total`);
    } catch (err) {
        console.warn(`[JazzHR] ${tenant.name} (${tenant.slug}): error -`, err);
    }
    return out;
}

export async function fetchJazzHrJobs(): Promise<RawJobData[]> {
    const startTime = Date.now();
    console.log(`[JazzHR] Scanning ${JAZZHR_TENANTS.length} tenant career boards...`);

    const allJobs: RawJobData[] = [];
    for (let i = 0; i < JAZZHR_TENANTS.length; i += BATCH_SIZE) {
        if (Date.now() - startTime >= TIME_BUDGET_MS) {
            console.warn(`[JazzHR] Time budget exhausted at tenant ${i}/${JAZZHR_TENANTS.length}`);
            break;
        }
        const batch = JAZZHR_TENANTS.slice(i, i + BATCH_SIZE);
        const settled = await Promise.allSettled(batch.map((t) => fetchTenantJobs(t)));
        for (const s of settled) {
            if (s.status === 'fulfilled') allJobs.push(...s.value);
        }
        if (i + BATCH_SIZE < JAZZHR_TENANTS.length) await sleep(TENANT_GAP_MS);
    }

    console.log(`[JazzHR] Total: ${allJobs.length} PMHNP-relevant jobs`);
    return allJobs;
}

export const jazzHrAggregator: Aggregator = {
    key: 'jazzhr',
    chunkCount: 1,
    async fetch(): Promise<RawJobData[]> {
        return fetchJazzHrJobs();
    },
    async probeJob(externalId: string, applyLink: string): Promise<HealthDecision | null> {
        return checkJobHealth(applyLink, 'jazzhr', { externalId });
    },
};
