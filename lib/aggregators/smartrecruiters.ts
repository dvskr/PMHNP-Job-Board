/**
 * SmartRecruiters Direct Scraper
 *
 * Fetches jobs from SmartRecruiters via their public JSON API.
 * Endpoint: https://api.smartrecruiters.com/v1/companies/{slug}/postings
 *
 * No API key required. Free and unlimited.
 *
 * 2026-05-05 fix: previously fetched the full description for EVERY
 * posting before filtering by title. Companies with hundreds of postings
 * (International SOS: 598) consumed the orchestrator's 240s budget on
 * description fetches alone, with zero source_stats rows ever recorded.
 * The adapter now title-filters BEFORE the description fetch — only
 * PMHNP-relevant postings incur the per-job HTTP call.
 */
import { isRelevantJob } from '@/lib/utils/job-filter';
import { SMARTRECRUITERS_TENANTS } from './tenants/smartrecruiters';
import { htmlToReadableText } from '@/lib/sanitize';

const SMARTRECRUITERS_COMPANIES = SMARTRECRUITERS_TENANTS;


interface SmartRecruitersPosting {
    id: string;
    name: string;
    uuid: string;
    refNumber?: string;
    company: { name: string; identifier: string };
    location: { city?: string; region?: string; country?: string; remote?: boolean };
    department?: { label: string };
    typeOfEmployment?: { label: string };
    experienceLevel?: { label: string };
    releasedDate?: string;
    ref?: string;
}

export interface SmartRecruitersJobRaw {
    externalId: string;
    title: string;
    company: string;
    location: string;
    description: string;
    applyLink: string;
    postedDate?: string;
    jobType?: string;
}


function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch job description from SmartRecruiters detail endpoint
 */
async function fetchJobDescription(companySlug: string, postingId: string): Promise<string> {
    const url = `https://api.smartrecruiters.com/v1/companies/${companySlug}/postings/${postingId}`;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) return '';
        const data = await res.json() as any;
        // The detail endpoint returns jobAd.sections with HTML content
        const sections = data.jobAd?.sections || {};
        const parts: string[] = [];
        if (sections.jobDescription?.text) parts.push(sections.jobDescription.text);
        if (sections.qualifications?.text) parts.push(sections.qualifications.text);
        if (sections.additionalInformation?.text) parts.push(sections.additionalInformation.text);
        if (sections.companyDescription?.text) parts.push(sections.companyDescription.text);
        // Strip HTML tags while preserving list/paragraph structure.
        return htmlToReadableText(parts.join('\n\n'));
    } catch {
        return '';
    }
}

/**
 * Fetch jobs from a single SmartRecruiters company
 */
async function fetchCompanyJobs(company: { slug: string; name: string }): Promise<SmartRecruitersJobRaw[]> {
    const allJobs: SmartRecruitersJobRaw[] = [];
    let offset = 0;
    const limit = 100;
    let totalFound = 0;

    try {
        // Paginate through all postings
        do {
            const url = `https://api.smartrecruiters.com/v1/companies/${company.slug}/postings?limit=${limit}&offset=${offset}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);

            if (!res.ok) {
                console.warn(`[SmartRecruiters] ${company.name}: HTTP ${res.status}`);
                break;
            }

            const data = await res.json() as any;
            totalFound = data.totalFound || 0;
            const postings: SmartRecruitersPosting[] = data.content || [];

            if (postings.length === 0) break;

            for (const posting of postings) {
                    // Title-only relevance check BEFORE fetching the full
                    // description. Saves 1 HTTP call per non-PMHNP posting.
                    // The orchestrator runs the same gate against title +
                    // description; this just moves the title check earlier
                    // so we don't waste API time on irrelevant titles.
                    if (!isRelevantJob(posting.name, '')) continue;

                    const description = await fetchJobDescription(company.slug, posting.id);

                    const locationParts = [
                        posting.location?.city,
                        posting.location?.region,
                    ].filter(Boolean);
                    const location = locationParts.length > 0
                        ? locationParts.join(', ')
                        : posting.location?.remote ? 'Remote' : 'United States';

                    allJobs.push({
                        externalId: `smartrecruiters-${company.slug}-${posting.id}`,
                        title: posting.name,
                        company: company.name,
                        location,
                        description,
                        applyLink: `https://jobs.smartrecruiters.com/${company.slug}/${posting.id}`,
                        postedDate: posting.releasedDate || undefined,
                        jobType: posting.typeOfEmployment?.label || undefined,
                    });

                    await sleep(100); // Rate limit between detail requests
            }

            offset += postings.length;

            if (offset >= totalFound) break;
            await sleep(200);
        } while (true);

        console.log(`[SmartRecruiters] ${company.name}: ${allJobs.length} PMHNP jobs found (${totalFound} total)`);
        return allJobs;
    } catch (error) {
        console.warn(`[SmartRecruiters] ${company.name}: Error -`, error);
        return allJobs;
    }
}

/**
 * Fetch PMHNP jobs from all SmartRecruiters companies
 */
export async function fetchSmartRecruitersJobs(): Promise<SmartRecruitersJobRaw[]> {
    console.log(`[SmartRecruiters] Scanning ${SMARTRECRUITERS_COMPANIES.length} company career sites...`);

    const allJobs: SmartRecruitersJobRaw[] = [];
    const BATCH_SIZE = 3;

    for (let i = 0; i < SMARTRECRUITERS_COMPANIES.length; i += BATCH_SIZE) {
        const batch = SMARTRECRUITERS_COMPANIES.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
            batch.map(company => fetchCompanyJobs(company))
        );

        for (const result of results) {
            if (result.status === 'fulfilled') {
                allJobs.push(...result.value);
            }
        }

        if (i + BATCH_SIZE < SMARTRECRUITERS_COMPANIES.length) {
            await sleep(500);
        }
    }

    console.log(`[SmartRecruiters] Total: ${allJobs.length} PMHNP jobs found across all companies`);
    return allJobs;
}

import type { Aggregator, RawJobData } from './types';
import { checkJobHealth, type HealthDecision } from '@/lib/health/check-job-health';

export const smartRecruitersAggregator: Aggregator = {
    key: 'smartrecruiters',
    chunkCount: 1,
    async fetch(): Promise<RawJobData[]> {
        return (await fetchSmartRecruitersJobs()) as unknown as RawJobData[];
    },
    async probeJob(externalId: string, applyLink: string): Promise<HealthDecision | null> {
        // Routes through checkJobHealth, which dispatches to the
        // SmartRecruiters JSON API probe (lib/health/probes/smartrecruiters-api.ts).
        return checkJobHealth(applyLink, 'smartrecruiters', { externalId });
    },
};
