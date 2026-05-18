/**
 * Workable adapter — public v2 board API.
 *
 * Endpoint:
 *   POST https://apply.workable.com/api/v2/accounts/{slug}/jobs?limit=100&offset=0
 *   body: {"query":"","department":[],"location":[],"remote":[]}
 *
 * Response: { total: number, results: WorkableJob[] }
 *
 * Public, unauthenticated. Each `result` has only metadata — full
 * description requires a second call to
 *   POST https://apply.workable.com/api/v2/accounts/{slug}/jobs/{shortcode}
 * which returns the full job-detail blob. We fetch detail only for
 * postings that pass the title-only relevance pre-filter.
 *
 * Tenants in lib/aggregators/tenants/workable.ts.
 */

import { isRelevantJob } from '@/lib/utils/job-filter';
import { WORKABLE_TENANTS } from './tenants/workable';
import type { Aggregator, RawJobData } from './types';
import { checkJobHealth, type HealthDecision } from '@/lib/health/check-job-health';
import { htmlToReadableText } from '@/lib/sanitize';

interface WorkableLocation {
    country?: string;
    countryCode?: string;
    city?: string;
    region?: string;
}

interface WorkableJob {
    id: number;
    shortcode: string;
    title: string;
    remote?: boolean;
    location?: WorkableLocation;
    locations?: WorkableLocation[];
    state?: string;
    published?: string;
    department?: string[];
    workplace?: string;
    description?: string;
    requirements?: string;
    benefits?: string;
    employmentType?: string;
}

interface WorkableListResponse {
    total?: number;
    results?: WorkableJob[];
}

const TIME_BUDGET_MS = 240_000;
const TENANT_GAP_MS = 400;
const DETAIL_FETCH_GAP_MS = 200;
const BATCH_SIZE = 3;
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildLocation(job: WorkableJob): string {
    const loc = job.location ?? job.locations?.[0];
    if (loc) {
        if (loc.city && loc.region) return `${loc.city}, ${loc.region}`;
        if (loc.region) return loc.region;
        if (loc.country) return loc.country;
    }
    if (job.remote) return 'Remote';
    return 'United States';
}

function mapWorkplace(job: WorkableJob): string | null {
    if (job.remote) return 'Remote';
    const w = job.workplace?.toLowerCase();
    if (w === 'remote') return 'Remote';
    if (w === 'hybrid') return 'Hybrid';
    if (w === 'on_site' || w === 'onsite') return 'In-Person';
    return null;
}

async function fetchDetail(slug: string, shortcode: string): Promise<WorkableJob | null> {
    const url = `https://apply.workable.com/api/v2/accounts/${slug}/jobs/${shortcode}`;
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(t);
        if (!res.ok) {
            // H6 fix: log non-OK detail fetches so a tenant returning 403/429
            // doesn't silently drop every job's description (jobs would still
            // pass the quality gate at title alone and ingest with empty body).
            console.warn(`[Workable] detail HTTP ${res.status} for ${slug}/${shortcode}`);
            return null;
        }
        return (await res.json()) as WorkableJob;
    } catch (err) {
        // H6 fix: surface network / abort failures so a tenant-level outage
        // is distinguishable from a tenant with no PMHNP openings.
        console.warn(`[Workable] detail fetch failed for ${slug}/${shortcode}:`, err instanceof Error ? err.message : err);
        return null;
    }
}

async function fetchTenantJobs(tenant: { slug: string; name: string }): Promise<RawJobData[]> {
    const out: RawJobData[] = [];
    const seen = new Set<string>();
    try {
        for (let page = 0; page < MAX_PAGES; page++) {
            const offset = page * PAGE_SIZE;
            const url = `https://apply.workable.com/api/v2/accounts/${tenant.slug}/jobs?limit=${PAGE_SIZE}&offset=${offset}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10_000);
            const res = await fetch(url, {
                method: 'POST',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ query: '', department: [], location: [], remote: [] }),
            });
            clearTimeout(timeout);

            if (!res.ok) {
                console.warn(`[Workable] ${tenant.name} (${tenant.slug}): HTTP ${res.status}`);
                break;
            }
            const data = (await res.json()) as WorkableListResponse;
            const results = data.results ?? [];
            if (results.length === 0) break;

            for (const j of results) {
                if (seen.has(j.shortcode)) continue;
                seen.add(j.shortcode);
                if (!isRelevantJob(j.title ?? '', '')) continue;

                const detail = await fetchDetail(tenant.slug, j.shortcode);
                const description = htmlToReadableText(
                    [detail?.description, detail?.requirements, detail?.benefits]
                        .filter(Boolean)
                        .join('\n\n')
                );

                // H6 fix: drop jobs whose description fetch silently failed.
                // Pushing an empty-description job lets a tenant outage poison
                // the ingest with thin records that still pass the title-only
                // quality gate. The next ingest cycle will retry.
                if (!description) {
                    console.warn(`[Workable] empty description for ${tenant.slug}/${j.shortcode} — dropping job`);
                    await sleep(DETAIL_FETCH_GAP_MS);
                    continue;
                }

                const applyLink = `https://apply.workable.com/${tenant.slug}/j/${j.shortcode}/`;

                out.push({
                    externalId: `workable-${tenant.slug}-${j.shortcode}`,
                    title: j.title,
                    company: tenant.name,
                    employer: tenant.name,
                    location: buildLocation(j),
                    description,
                    applyLink,
                    postedDate: j.published,
                    postedAt: j.published,
                    jobType: detail?.employmentType,
                    sourceProvider: 'workable',
                    sourceSite: 'workable',
                    isRemote: mapWorkplace(j) === 'Remote' || undefined,
                } as RawJobData);

                await sleep(DETAIL_FETCH_GAP_MS);
            }

            if (results.length < PAGE_SIZE) break;
        }
        console.log(`[Workable] ${tenant.name}: ${out.length} PMHNP-relevant jobs`);
    } catch (err) {
        console.warn(`[Workable] ${tenant.name} (${tenant.slug}): error -`, err);
    }
    return out;
}

export async function fetchWorkableJobs(): Promise<RawJobData[]> {
    const startTime = Date.now();
    console.log(`[Workable] Scanning ${WORKABLE_TENANTS.length} tenant career boards...`);

    const allJobs: RawJobData[] = [];
    for (let i = 0; i < WORKABLE_TENANTS.length; i += BATCH_SIZE) {
        if (Date.now() - startTime >= TIME_BUDGET_MS) {
            console.warn(`[Workable] Time budget exhausted at tenant ${i}/${WORKABLE_TENANTS.length}`);
            break;
        }
        const batch = WORKABLE_TENANTS.slice(i, i + BATCH_SIZE);
        const settled = await Promise.allSettled(batch.map((t) => fetchTenantJobs(t)));
        for (const s of settled) {
            if (s.status === 'fulfilled') allJobs.push(...s.value);
        }
        if (i + BATCH_SIZE < WORKABLE_TENANTS.length) await sleep(TENANT_GAP_MS);
    }

    console.log(`[Workable] Total: ${allJobs.length} PMHNP-relevant jobs`);
    return allJobs;
}

export const workableAggregator: Aggregator = {
    key: 'workable',
    chunkCount: 1,
    async fetch(): Promise<RawJobData[]> {
        return fetchWorkableJobs();
    },
    async probeJob(externalId: string, applyLink: string): Promise<HealthDecision | null> {
        return checkJobHealth(applyLink, 'workable', { externalId });
    },
};
