/**
 * Ashby adapter — public job-board API.
 *
 * Endpoint: https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true
 * Docs:     https://developers.ashbyhq.com/reference/getjobboardlistingsforpublic
 *
 * Public, unauthenticated. Returns the full job list in a single
 * response (no pagination) so the adapter is just a per-tenant fan-out.
 *
 * Tenants live in lib/aggregators/tenants/ashby.ts. To add a slug,
 * first run `npx tsx scripts/discover-ashby-tenants.ts` to confirm the
 * board exists and surfaces PMHNP-relevant titles.
 */

import { isRelevantJob } from '@/lib/utils/job-filter';
import { ASHBY_TENANTS } from './tenants/ashby';
import type { Aggregator, RawJobData } from './types';
import { checkJobHealth, type HealthDecision } from '@/lib/health/check-job-health';
import { htmlToReadableText } from '@/lib/sanitize';

interface AshbyPostalAddress {
    addressRegion?: string;
    addressCountry?: string;
    addressLocality?: string;
}

interface AshbyAddress {
    postalAddress?: AshbyPostalAddress;
}

interface AshbyCompensationComponent {
    summary?: string;
    compensationType?: string;
    interval?: string;
    currencyCode?: string;
    minValue?: number;
    maxValue?: number;
}

interface AshbyCompensation {
    summaryComponents?: AshbyCompensationComponent[];
    currencyCode?: string;
}

interface AshbyJob {
    id: string;
    title: string;
    departmentName?: string;
    team?: string;
    employmentType?: string;
    location?: string;
    publishedDate?: string;
    isRemote?: boolean;
    address?: AshbyAddress;
    secondaryLocations?: Array<{ location?: string; address?: AshbyAddress }>;
    descriptionHtml?: string;
    descriptionPlain?: string;
    jobUrl?: string;
    applyUrl?: string;
    compensation?: AshbyCompensation;
}

interface AshbyResponse {
    apiVersion: string;
    jobs: AshbyJob[];
}

const TIME_BUDGET_MS = 240_000;
const TENANT_GAP_MS = 250;
const BATCH_SIZE = 3;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildLocation(job: AshbyJob): string {
    const addr = job.address?.postalAddress;
    if (addr) {
        const city = addr.addressLocality;
        const state = addr.addressRegion;
        if (city && state) return `${city}, ${state}`;
        if (state) return state;
    }
    if (job.location) return job.location;
    if (job.isRemote) return 'Remote';
    return 'United States';
}

function mapEmploymentType(type?: string): string | null {
    if (!type) return null;
    const t = type.toLowerCase();
    if (t === 'fulltime' || t === 'full_time' || t === 'full-time') return 'Full-Time';
    if (t === 'parttime' || t === 'part_time' || t === 'part-time') return 'Part-Time';
    if (t === 'contract' || t === 'temporary') return 'Contract';
    if (t === 'intern') return 'Internship';
    return null;
}

/**
 * Extract min/max annual salary from Ashby's compensation block.
 * `summaryComponents` is the structured field — fall back to nothing
 * rather than parsing the free-text summary, which is unreliable.
 */
function mapSalary(comp?: AshbyCompensation): {
    minSalary: number | null;
    maxSalary: number | null;
    salaryPeriod: string | null;
} {
    const first = comp?.summaryComponents?.find(
        (c) => c.compensationType === 'Salary' || c.compensationType === 'Hourly',
    );
    if (!first) return { minSalary: null, maxSalary: null, salaryPeriod: null };
    const min = typeof first.minValue === 'number' ? first.minValue : null;
    const max = typeof first.maxValue === 'number' ? first.maxValue : null;
    if (min === null && max === null) return { minSalary: null, maxSalary: null, salaryPeriod: null };

    // Annualize hourly (2080 hrs/year) so downstream display normalizes.
    const isHourly = first.interval === 'Hour' || first.compensationType === 'Hourly';
    if (isHourly) {
        return {
            minSalary: min !== null ? Math.round(min * 2080) : null,
            maxSalary: max !== null ? Math.round(max * 2080) : null,
            salaryPeriod: 'annual',
        };
    }
    return { minSalary: min, maxSalary: max, salaryPeriod: 'annual' };
}

async function fetchTenantJobs(tenant: { slug: string; name: string }): Promise<RawJobData[]> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${tenant.slug}?includeCompensation=true`;
    const out: RawJobData[] = [];
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) {
            console.warn(`[Ashby] ${tenant.name} (${tenant.slug}): HTTP ${res.status}`);
            return out;
        }
        const data = (await res.json()) as AshbyResponse;
        const jobs = data.jobs ?? [];

        for (const j of jobs) {
            // Title-only relevance pre-filter. The orchestrator runs the
            // same gate against title + description so this just avoids
            // pushing obvious non-PMHNP titles through normalization.
            if (!isRelevantJob(j.title ?? '', '')) continue;

            // Prefer the HTML payload so htmlToReadableText can preserve
            // list/paragraph structure. Falling back to descriptionPlain
            // is still fine — the helper is a no-op on plain text.
            const description = htmlToReadableText(j.descriptionHtml ?? j.descriptionPlain ?? '');
            const salary = mapSalary(j.compensation);
            const applyLink = j.applyUrl || j.jobUrl;
            if (!applyLink) continue;

            out.push({
                externalId: `ashby-${tenant.slug}-${j.id}`,
                title: j.title,
                company: tenant.name,
                employer: tenant.name,
                location: buildLocation(j),
                description,
                applyLink,
                postedDate: j.publishedDate,
                postedAt: j.publishedDate,
                jobType: mapEmploymentType(j.employmentType) ?? undefined,
                minSalary: salary.minSalary,
                maxSalary: salary.maxSalary,
                salaryPeriod: salary.salaryPeriod,
                sourceProvider: 'ashby',
                sourceSite: 'ashby',
            } as RawJobData);
        }
        console.log(`[Ashby] ${tenant.name}: ${out.length} PMHNP-relevant of ${jobs.length} total`);
    } catch (err) {
        console.warn(`[Ashby] ${tenant.name} (${tenant.slug}): error -`, err);
    }
    return out;
}

export async function fetchAshbyJobs(): Promise<RawJobData[]> {
    const startTime = Date.now();
    console.log(`[Ashby] Scanning ${ASHBY_TENANTS.length} org boards...`);

    const allJobs: RawJobData[] = [];

    for (let i = 0; i < ASHBY_TENANTS.length; i += BATCH_SIZE) {
        if (Date.now() - startTime >= TIME_BUDGET_MS) {
            console.warn(`[Ashby] Time budget exhausted at tenant ${i}/${ASHBY_TENANTS.length}`);
            break;
        }
        const batch = ASHBY_TENANTS.slice(i, i + BATCH_SIZE);
        const settled = await Promise.allSettled(batch.map((t) => fetchTenantJobs(t)));
        for (const s of settled) {
            if (s.status === 'fulfilled') allJobs.push(...s.value);
        }
        if (i + BATCH_SIZE < ASHBY_TENANTS.length) await sleep(TENANT_GAP_MS);
    }

    console.log(`[Ashby] Total: ${allJobs.length} PMHNP-relevant jobs across ${ASHBY_TENANTS.length} tenants`);
    return allJobs;
}

export const ashbyAggregator: Aggregator = {
    key: 'ashby',
    chunkCount: 1,
    async fetch(): Promise<RawJobData[]> {
        return fetchAshbyJobs();
    },
    async probeJob(externalId: string, applyLink: string): Promise<HealthDecision | null> {
        return checkJobHealth(applyLink, 'ashby', { externalId });
    },
};
