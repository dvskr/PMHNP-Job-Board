/**
 * USAJobs adapter — federal government job postings.
 *
 * Endpoint: https://data.usajobs.gov/api/search
 * Docs:     https://developer.usajobs.gov/api-reference/get-api-search
 *
 * Why this source: the VA is the single largest PMHNP employer in the
 * United States. USAJobs is the official aggregator of every federal
 * civil-service posting (VA, IHS, BoP, DoD, etc.), so it covers ground
 * no commercial ATS scrape can reach.
 *
 * Auth: USAJOBS_API_KEY + USAJOBS_USER_AGENT (registered email).
 * Quota: documented soft limit "below 50 requests per second", no
 *   monthly cap. We stay well under at 1 req / 500ms.
 *
 * Filter shape: JobCategoryCode=0610 (federal Nurse series) AND one of
 * the psychiatric/mental-health keyword variants. Keeps the funnel
 * tight enough that the orchestrator's downstream relevance filter
 * sees almost no off-target postings.
 */

import { USAJOBS_SEARCH_QUERIES as SEARCH_QUERIES } from './search-terms/usajobs';
import { RateLimiter } from './types';
import { htmlToReadableText } from '@/lib/sanitize';

interface UsaJobsPositionLocation {
    LocationName?: string;
    CountryCode?: string;
    CountrySubDivisionCode?: string;
    CityName?: string;
}

interface UsaJobsRemuneration {
    MinimumRange?: string;
    MaximumRange?: string;
    RateIntervalCode?: string;
    Description?: string;
}

interface UsaJobsCategory {
    Name?: string;
    Code?: string;
}

interface UsaJobsSchedule {
    Name?: string;
    Code?: string;
}

interface UsaJobsUserAreaDetails {
    JobSummary?: string;
    MajorDuties?: string[] | string;
    Requirements?: string;
    Education?: string;
    Evaluations?: string;
    HowToApply?: string;
    WhatToExpectNext?: string;
    RequiredDocuments?: string;
    Benefits?: string;
    OtherInformation?: string;
    KeyRequirements?: string[];
}

interface UsaJobsDescriptor {
    PositionID: string;
    PositionTitle: string;
    PositionURI: string;
    ApplyURI?: string[];
    PositionLocationDisplay?: string;
    PositionLocation?: UsaJobsPositionLocation[];
    OrganizationName?: string;
    DepartmentName?: string;
    JobCategory?: UsaJobsCategory[];
    PositionSchedule?: UsaJobsSchedule[];
    PositionOfferingType?: UsaJobsSchedule[];
    QualificationSummary?: string;
    PositionRemuneration?: UsaJobsRemuneration[];
    PositionStartDate?: string;
    PositionEndDate?: string;
    PublicationStartDate?: string;
    UserArea?: { Details?: UsaJobsUserAreaDetails };
}

interface UsaJobsSearchItem {
    MatchedObjectId: string;
    MatchedObjectDescriptor: UsaJobsDescriptor;
}

interface UsaJobsResponse {
    SearchResult?: {
        SearchResultCount?: number;
        SearchResultCountAll?: number;
        SearchResultItems?: UsaJobsSearchItem[];
    };
}

const USAJOBS_BASE_URL = 'https://data.usajobs.gov/api/search';
// 0610 = federal occupational series for "Nurse". Combined with the
// psychiatric/mental-health keyword variants, this is precise enough
// that we don't need extra category codes (0602 Medical Officer is
// physicians, not NPs).
const NURSE_CATEGORY_CODE = '0610';
const RESULTS_PER_PAGE = 500;
const MAX_PAGES_PER_QUERY = 20; // 500 × 20 = 10k cap per query — far more than the federal pipeline produces
const REQUEST_GAP_MS = 500;
const QUERY_GAP_MS = 300;
const TIME_BUDGET_MS = 180_000; // under orchestrator MAX_INGESTION_MS (240s) so the insert loop has headroom
// USAJobs `DatePosted` accepts 0, 1, 3, 7, 15, 30, 60. 30d matches the
// ingest-gate freshness policy (see project memory freshness_policy).
const DATE_POSTED_DAYS = '30';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build "City, State" from PositionLocation[0], falling back to
 * PositionLocationDisplay (which is already formatted but sometimes
 * "Location Negotiable After Selection" for fully-remote roles).
 */
function buildLocation(d: UsaJobsDescriptor): string {
    const first = d.PositionLocation?.[0];
    if (first) {
        const city = first.CityName?.split(',')[0]?.trim();
        const state = first.CountrySubDivisionCode?.trim();
        if (city && state) return `${city}, ${state}`;
        if (state) return state;
        if (first.LocationName) return first.LocationName;
    }
    return d.PositionLocationDisplay || 'United States';
}

/**
 * Compose a single description blob from the federal posting's
 * structured sections. USAJobs splits content across JobSummary,
 * MajorDuties, QualificationSummary, Requirements, Education and
 * Evaluations — concatenating them gives the normalizer enough to
 * pass the completeness floor.
 */
function buildDescription(d: UsaJobsDescriptor): string {
    const parts: string[] = [];
    const details = d.UserArea?.Details;
    if (details?.JobSummary) parts.push(details.JobSummary);
    if (details?.MajorDuties) {
        const duties = Array.isArray(details.MajorDuties)
            ? details.MajorDuties.join('\n')
            : details.MajorDuties;
        if (duties) parts.push(`Major Duties:\n${duties}`);
    }
    if (d.QualificationSummary) parts.push(`Qualifications:\n${d.QualificationSummary}`);
    if (details?.Requirements) parts.push(`Requirements:\n${details.Requirements}`);
    if (details?.Education) parts.push(`Education:\n${details.Education}`);
    if (details?.Evaluations) parts.push(`Evaluations:\n${details.Evaluations}`);
    if (details?.Benefits) parts.push(`Benefits:\n${details.Benefits}`);
    return htmlToReadableText(parts.join('\n\n'));
}

function mapJobType(d: UsaJobsDescriptor): string | null {
    const schedule = d.PositionSchedule?.[0]?.Name?.toLowerCase();
    if (!schedule) return null;
    if (schedule.includes('full')) return 'Full-Time';
    if (schedule.includes('part')) return 'Part-Time';
    if (schedule.includes('intermittent') || schedule.includes('on call')) return 'Per Diem';
    return null;
}

/**
 * Convert USAJobs remuneration to annualized USD min/max.
 * RateIntervalCode: PA=Per Annum, PH=Per Hour, PD=Per Day, PW=Per Week.
 */
function mapSalary(d: UsaJobsDescriptor): {
    minSalary: number | null;
    maxSalary: number | null;
    salaryPeriod: string | null;
} {
    const rem = d.PositionRemuneration?.[0];
    if (!rem) return { minSalary: null, maxSalary: null, salaryPeriod: null };
    const min = rem.MinimumRange ? Number(rem.MinimumRange) : null;
    const max = rem.MaximumRange ? Number(rem.MaximumRange) : null;
    if (min === null && max === null) return { minSalary: null, maxSalary: null, salaryPeriod: null };
    const code = rem.RateIntervalCode;
    // Annualize hourly ranges (2080 hrs/year, federal standard) so the
    // job-board's normalized salary band is comparable across sources.
    if (code === 'PH') {
        return {
            minSalary: min !== null ? Math.round(min * 2080) : null,
            maxSalary: max !== null ? Math.round(max * 2080) : null,
            salaryPeriod: 'annual',
        };
    }
    if (code === 'PD') {
        return {
            minSalary: min !== null ? Math.round(min * 260) : null,
            maxSalary: max !== null ? Math.round(max * 260) : null,
            salaryPeriod: 'annual',
        };
    }
    if (code === 'PW') {
        return {
            minSalary: min !== null ? Math.round(min * 52) : null,
            maxSalary: max !== null ? Math.round(max * 52) : null,
            salaryPeriod: 'annual',
        };
    }
    return { minSalary: min, maxSalary: max, salaryPeriod: 'annual' };
}

export async function fetchUsaJobs(): Promise<Array<Record<string, unknown>>> {
    const apiKey = process.env.USAJOBS_API_KEY;
    const userAgent = process.env.USAJOBS_USER_AGENT;

    if (!apiKey || !userAgent) {
        console.error('[USAJobs] USAJOBS_API_KEY or USAJOBS_USER_AGENT not configured');
        return [];
    }

    const startTime = Date.now();
    const allJobs: Array<Record<string, unknown>> = [];
    const seenIds = new Set<string>();
    const pageRateLimiter = new RateLimiter(REQUEST_GAP_MS);
    let totalRawJobs = 0;

    const headers: HeadersInit = {
        Host: 'data.usajobs.gov',
        'User-Agent': userAgent,
        'Authorization-Key': apiKey,
        Accept: 'application/json',
    };

    console.log(`[USAJobs] Starting fetch with ${SEARCH_QUERIES.length} keyword variants...`);

    for (const query of SEARCH_QUERIES) {
        if (Date.now() - startTime >= TIME_BUDGET_MS) {
            console.warn(
                `[USAJobs] Time budget exhausted (${((Date.now() - startTime) / 1000).toFixed(1)}s). ` +
                `Returning ${allJobs.length} jobs collected so far.`,
            );
            break;
        }

        for (let page = 1; page <= MAX_PAGES_PER_QUERY; page++) {
            try {
                const params = new URLSearchParams({
                    Keyword: query,
                    JobCategoryCode: NURSE_CATEGORY_CODE,
                    ResultsPerPage: String(RESULTS_PER_PAGE),
                    Page: String(page),
                    DatePosted: DATE_POSTED_DAYS,
                });
                const url = `${USAJOBS_BASE_URL}?${params.toString()}`;

                const response = await fetch(url, { headers });

                if (!response.ok) {
                    console.error(`[USAJobs] HTTP ${response.status} for "${query}" page ${page}`);
                    break;
                }

                const data = (await response.json()) as UsaJobsResponse;
                const items = data.SearchResult?.SearchResultItems ?? [];
                const totalAll = data.SearchResult?.SearchResultCountAll ?? 0;

                console.log(`[USAJobs] "${query}" page ${page}: ${items.length} jobs (total available: ${totalAll})`);

                if (items.length === 0) break;

                for (const item of items) {
                    if (seenIds.has(item.MatchedObjectId)) continue;
                    seenIds.add(item.MatchedObjectId);
                    totalRawJobs++;

                    const d = item.MatchedObjectDescriptor;
                    const applyLink = d.ApplyURI?.[0] || d.PositionURI;
                    if (!applyLink) continue;

                    const salary = mapSalary(d);

                    allJobs.push({
                        title: d.PositionTitle,
                        employer: d.OrganizationName || d.DepartmentName || 'Federal Government',
                        location: buildLocation(d),
                        description: buildDescription(d),
                        minSalary: salary.minSalary,
                        maxSalary: salary.maxSalary,
                        salaryPeriod: salary.salaryPeriod,
                        jobType: mapJobType(d),
                        applyLink,
                        externalId: `usajobs-${item.MatchedObjectId}`,
                        sourceProvider: 'usajobs',
                        sourceSite: 'usajobs',
                        postedAt: d.PublicationStartDate || d.PositionStartDate,
                    });
                }

                await pageRateLimiter.throttle();

                if (items.length < RESULTS_PER_PAGE) break;
            } catch (error) {
                console.error(`[USAJobs] Error fetching "${query}" page ${page}:`, error);
                break;
            }
        }

        await sleep(QUERY_GAP_MS);
    }

    console.log(`[USAJobs] VALIDATION STATS:`);
    console.log(`    Total Raw Jobs Fetched: ${totalRawJobs}`);
    console.log(`    Final Passed to Pipeline: ${allJobs.length}`);

    return allJobs;
}

import type { Aggregator, RawJobData } from './types';
import { checkJobHealth, type HealthDecision } from '@/lib/health/check-job-health';

export const usaJobsAggregator: Aggregator = {
    key: 'usajobs',
    chunkCount: 1,
    async fetch(): Promise<RawJobData[]> {
        return (await fetchUsaJobs()) as unknown as RawJobData[];
    },
    async probeJob(externalId: string, applyLink: string): Promise<HealthDecision | null> {
        return checkJobHealth(applyLink, 'usajobs', { externalId });
    },
};
