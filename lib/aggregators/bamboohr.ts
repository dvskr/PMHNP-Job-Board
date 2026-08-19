/**
 * BambooHR adapter — public careers/list JSON endpoint + detail JSON.
 *
 * Endpoint: GET https://{slug}.bamboohr.com/careers/list
 * Response: { meta: { totalCount }, result: [{ id, jobOpeningName, ... }] }
 *
 * Public, unauthenticated. No pagination — endpoint returns the
 * complete list in one response.
 *
 * 2026-08-19 fix: this adapter previously skipped detail fetching on
 * the assumption that the list payload "has enough for the normalizer's
 * completeness gate". It does not — the list rows carry NO description
 * (live probe across all 25 boards: zero rows with descriptionHtml), so
 * every title-relevant candidate entered the pipeline with a ~5-line
 * synthetic blob and died at the orchestrator's soft completeness floor
 * (source_stats: normalizer_low_completeness 10-13/day, i.e. every
 * non-duplicate candidate). The public JSON detail endpoint
 *   GET https://{slug}.bamboohr.com/careers/{id}/detail
 * returns { result: { jobOpening: { description, datePosted,
 * compensation, location, ... } } } with the full HTML description
 * (5-10 KB). We now fetch it for title-relevant candidates only
 * (~12/run across all tenants), and also surface `datePosted` and
 * `compensation` so freshness gating and salary extraction see the
 * truth. Failed detail fetches degrade to the old synthetic blob.
 *
 * Tenants in lib/aggregators/tenants/bamboohr.ts.
 */

import { isRelevantJob } from '@/lib/utils/job-filter';
import { BAMBOOHR_TENANTS } from './tenants/bamboohr';
import type { Aggregator, RawJobData } from './types';
import { checkJobHealth, type HealthDecision } from '@/lib/health/check-job-health';
import { htmlToReadableText } from '@/lib/sanitize';

interface BambooHrJob {
    id: string;
    jobOpeningName: string;
    departmentId?: string;
    departmentLabel?: string;
    employmentStatusLabel?: string;
    locationCity?: string;
    locationState?: string;
    locationCountry?: string;
    location?: { city?: string; state?: string; country?: string; postalCode?: string };
    jobOpeningStatus?: string;
    datePosted?: string;
    isRemote?: boolean | string;
    descriptionHtml?: string;
    /** Free-text pay string from the detail endpoint (e.g. "$110,000-$130,000 per year"). */
    compensation?: string | null;
}

interface BambooHrResponse {
    meta?: { totalCount?: number };
    result?: BambooHrJob[];
}

/** Shape of result.jobOpening in the careers/{id}/detail response. */
interface BambooHrJobDetail {
    description?: string;
    compensation?: string | null;
    datePosted?: string;
    location?: { city?: string; state?: string };
    employmentStatusLabel?: string;
}

const TIME_BUDGET_MS = 180_000; // under orchestrator MAX_INGESTION_MS (240s) so the insert loop has headroom
const TENANT_GAP_MS = 300;
const DETAIL_FETCH_GAP_MS = 200;
const BATCH_SIZE = 5;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildLocation(job: BambooHrJob): string {
    const city = job.locationCity ?? job.location?.city;
    const state = job.locationState ?? job.location?.state;
    if (city && state) return `${city}, ${state}`;
    if (state) return state;
    if (city) return city;
    if (typeof job.isRemote === 'string' && job.isRemote.toLowerCase() === 'yes') return 'Remote';
    if (job.isRemote === true) return 'Remote';
    return 'United States';
}

function mapEmploymentStatus(label?: string): string | null {
    if (!label) return null;
    const l = label.toLowerCase();
    if (l.includes('full')) return 'Full-Time';
    if (l.includes('part')) return 'Part-Time';
    if (l.includes('contract') || l.includes('temp') || l.includes('contractor')) return 'Contract';
    if (l.includes('prn') || l.includes('per diem')) return 'Per Diem';
    if (l.includes('intern')) return 'Internship';
    return null;
}

/**
 * BambooHR list endpoint gives metadata but not a real description.
 * Compose a best-effort blob from the structured fields available so
 * the orchestrator's completeness gate has something to read.
 */
function buildDescription(job: BambooHrJob, employerName: string): string {
    const lines: string[] = [];
    if (job.jobOpeningName) lines.push(job.jobOpeningName);
    lines.push(`Employer: ${employerName}`);
    if (job.departmentLabel) lines.push(`Department: ${job.departmentLabel}`);
    if (job.employmentStatusLabel) lines.push(`Employment: ${job.employmentStatusLabel}`);
    // Free-text pay line so the normalizer's salary extraction can read it.
    if (job.compensation) lines.push(`Compensation: ${job.compensation}`);
    const loc = buildLocation(job);
    if (loc) lines.push(`Location: ${loc}`);
    if (job.descriptionHtml) {
        lines.push('');
        lines.push(htmlToReadableText(job.descriptionHtml));
    }
    return lines.join('\n');
}

/**
 * Fetch the full job detail JSON. Returns null on any failure — the
 * caller then falls back to the synthetic list-field description
 * (pre-fix behavior), which the completeness gate will judge honestly.
 */
async function fetchJobDetail(slug: string, id: string): Promise<BambooHrJobDetail | null> {
    const url = `https://${slug}.bamboohr.com/careers/${id}/detail`;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) {
            console.warn(`[BambooHR] ${slug}/${id}: detail HTTP ${res.status}`);
            return null;
        }
        const data = (await res.json()) as { result?: { jobOpening?: BambooHrJobDetail } };
        return data.result?.jobOpening ?? null;
    } catch (err) {
        console.warn(`[BambooHR] ${slug}/${id}: detail fetch failed -`, err instanceof Error ? err.message : err);
        return null;
    }
}

async function fetchTenantJobs(tenant: { slug: string; name: string }): Promise<RawJobData[]> {
    const url = `https://${tenant.slug}.bamboohr.com/careers/list`;
    const out: RawJobData[] = [];
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) {
            console.warn(`[BambooHR] ${tenant.name} (${tenant.slug}): HTTP ${res.status}`);
            return out;
        }
        const data = (await res.json()) as BambooHrResponse;
        const jobs = data.result ?? [];

        for (const j of jobs) {
            if (!isRelevantJob(j.jobOpeningName ?? '', '')) continue;

            // Detail fetch for relevant candidates only (~12/run across
            // all tenants). Merged immutably — list fields win where both
            // exist, detail fills the gaps (description, datePosted,
            // compensation, city/state).
            const detail = await fetchJobDetail(tenant.slug, j.id);
            const merged: BambooHrJob = {
                ...j,
                descriptionHtml: j.descriptionHtml ?? detail?.description,
                datePosted: j.datePosted ?? detail?.datePosted,
                compensation: j.compensation ?? detail?.compensation,
                locationCity: j.locationCity ?? detail?.location?.city,
                locationState: j.locationState ?? detail?.location?.state,
                employmentStatusLabel: j.employmentStatusLabel ?? detail?.employmentStatusLabel,
            };

            const applyLink = `https://${tenant.slug}.bamboohr.com/careers/${j.id}`;
            out.push({
                externalId: `bamboohr-${tenant.slug}-${j.id}`,
                title: merged.jobOpeningName,
                company: tenant.name,
                employer: tenant.name,
                location: buildLocation(merged),
                description: buildDescription(merged, tenant.name),
                applyLink,
                postedDate: merged.datePosted,
                postedAt: merged.datePosted,
                jobType: mapEmploymentStatus(merged.employmentStatusLabel) ?? undefined,
                sourceProvider: 'bamboohr',
                sourceSite: 'bamboohr',
            } as RawJobData);
            await sleep(DETAIL_FETCH_GAP_MS);
        }
        console.log(`[BambooHR] ${tenant.name}: ${out.length} PMHNP-relevant of ${jobs.length} total`);
    } catch (err) {
        console.warn(`[BambooHR] ${tenant.name} (${tenant.slug}): error -`, err);
    }
    return out;
}

export async function fetchBambooHrJobs(): Promise<RawJobData[]> {
    const startTime = Date.now();
    console.log(`[BambooHR] Scanning ${BAMBOOHR_TENANTS.length} tenant career sites...`);

    const allJobs: RawJobData[] = [];

    for (let i = 0; i < BAMBOOHR_TENANTS.length; i += BATCH_SIZE) {
        if (Date.now() - startTime >= TIME_BUDGET_MS) {
            console.warn(`[BambooHR] Time budget exhausted at tenant ${i}/${BAMBOOHR_TENANTS.length}`);
            break;
        }
        const batch = BAMBOOHR_TENANTS.slice(i, i + BATCH_SIZE);
        const settled = await Promise.allSettled(batch.map((t) => fetchTenantJobs(t)));
        for (const s of settled) {
            if (s.status === 'fulfilled') allJobs.push(...s.value);
        }
        if (i + BATCH_SIZE < BAMBOOHR_TENANTS.length) await sleep(TENANT_GAP_MS);
    }

    console.log(`[BambooHR] Total: ${allJobs.length} PMHNP-relevant jobs`);
    return allJobs;
}

export const bambooHrAggregator: Aggregator = {
    key: 'bamboohr',
    chunkCount: 1,
    async fetch(): Promise<RawJobData[]> {
        return fetchBambooHrJobs();
    },
    async probeJob(externalId: string, applyLink: string): Promise<HealthDecision | null> {
        return checkJobHealth(applyLink, 'bamboohr', { externalId });
    },
};
