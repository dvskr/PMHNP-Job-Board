/**
 * Workday Direct Scraper
 * 
 * Scrapes Workday career sites directly via their hidden JSON API.
 * Each employer has a POST endpoint at:
 *   https://{slug}.wd{instance}.myworkdayjobs.com/wday/cxs/{slug}/{site}/jobs
 * 
 * No API key required. Free and unlimited.
 */

import { isRelevantJob } from '../utils/job-filter';

interface WorkdayCompany {
    slug: string;
    instance: number;
    site: string;
    name: string;
}

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

// === Verified Workday career sites ===
// Discovered via scripts/discover-workday-sites.ts on 2026-02-13
const WORKDAY_COMPANIES: WorkdayCompany[] = [
    { slug: 'trinityhealth', instance: 1, site: 'jobs', name: 'Trinity Health' },           // 2000 total jobs
    { slug: 'memorialhermann', instance: 5, site: 'External', name: 'Memorial Hermann' },   // 573 total jobs
    { slug: 'sharp', instance: 1, site: 'External', name: 'Sharp HealthCare' },             // 159 total jobs
    { slug: 'lifestance', instance: 5, site: 'Careers', name: 'LifeStance Health' },        // 98 total jobs
    { slug: 'chghealthcare', instance: 1, site: 'External', name: 'CHG Healthcare' },       // 32 total jobs
];

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch job description from the Workday job detail endpoint
 */
async function fetchJobDescription(company: WorkdayCompany, externalPath: string): Promise<string> {
    const url = `https://${company.slug}.wd${company.instance}.myworkdayjobs.com/wday/cxs/${company.slug}/${company.site}${externalPath}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) return '';

        const data = await res.json();
        // Workday returns jobPostingInfo with jobDescription in HTML
        return data?.jobPostingInfo?.jobDescription || '';
    } catch {
        return '';
    }
}

/**
 * Search for PMHNP jobs on a specific Workday company site
 */
async function fetchCompanyJobs(company: WorkdayCompany): Promise<WorkdayJobRaw[]> {
    const baseUrl = `https://${company.slug}.wd${company.instance}.myworkdayjobs.com/wday/cxs/${company.slug}/${company.site}/jobs`;
    const applyBase = `https://${company.slug}.wd${company.instance}.myworkdayjobs.com/en-US/${company.site}`;

    // PMHNP search terms — cast a wide net, let isRelevantJob filter precisely
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

                    // Fetch the full job description
                    const description = await fetchJobDescription(company, posting.externalPath);
                    await sleep(200); // Be polite

                    // Final relevance filter
                    if (!isRelevantJob(posting.title, description)) continue;

                    allJobs.push({
                        externalId: `workday-${company.slug}-${jobId}`,
                        title: posting.title,
                        company: company.name,
                        location: posting.locationsText || 'United States',
                        description,
                        applyLink: `${applyBase}${posting.externalPath}`,
                        postedDate: posting.postedOn || undefined,
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
 * Fetch PMHNP jobs from all Workday companies
 */
export async function fetchWorkdayJobs(): Promise<WorkdayJobRaw[]> {
    console.log(`[Workday] Checking ${WORKDAY_COMPANIES.length} Workday career sites for PMHNP jobs...`);

    const allJobs: WorkdayJobRaw[] = [];
    const failedCompanies: string[] = [];

    try {
        for (const company of WORKDAY_COMPANIES) {
            try {
                const jobs = await fetchCompanyJobs(company);
                allJobs.push(...jobs);

                // Rate limiting between companies
                await sleep(1000);
            } catch {
                failedCompanies.push(company.name);
                console.error(`[Workday] Failed to fetch from ${company.name}`);
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
