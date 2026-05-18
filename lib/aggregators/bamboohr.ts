/**
 * BambooHR adapter — public careers/list JSON endpoint.
 *
 * Endpoint: GET https://{slug}.bamboohr.com/careers/list
 * Response: { meta: { totalCount }, result: [{ id, jobOpeningName, ... }] }
 *
 * Public, unauthenticated. No pagination — endpoint returns the
 * complete list in one response. Detail fetch uses
 * https://{slug}.bamboohr.com/careers/{id} which returns HTML; we
 * derive the description from a small list of JSON-embedded fields
 * that the list endpoint already exposes (employmentStatusLabel,
 * departmentLabel, locationCity, locationState, jobOpeningName, etc.).
 * Detail-page scraping is intentionally skipped — the list payload
 * has enough for the normalizer's completeness gate.
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
}

interface BambooHrResponse {
    meta?: { totalCount?: number };
    result?: BambooHrJob[];
}

const TIME_BUDGET_MS = 240_000;
const TENANT_GAP_MS = 300;
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
    const loc = buildLocation(job);
    if (loc) lines.push(`Location: ${loc}`);
    if (job.descriptionHtml) {
        lines.push('');
        lines.push(htmlToReadableText(job.descriptionHtml));
    }
    return lines.join('\n');
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
            const applyLink = `https://${tenant.slug}.bamboohr.com/careers/${j.id}`;
            out.push({
                externalId: `bamboohr-${tenant.slug}-${j.id}`,
                title: j.jobOpeningName,
                company: tenant.name,
                employer: tenant.name,
                location: buildLocation(j),
                description: buildDescription(j, tenant.name),
                applyLink,
                postedDate: j.datePosted,
                postedAt: j.datePosted,
                jobType: mapEmploymentStatus(j.employmentStatusLabel) ?? undefined,
                sourceProvider: 'bamboohr',
                sourceSite: 'bamboohr',
            } as RawJobData);
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
