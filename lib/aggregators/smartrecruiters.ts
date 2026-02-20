/**
 * SmartRecruiters Direct Scraper
 * 
 * Fetches jobs from SmartRecruiters via their public JSON API.
 * Endpoint: https://api.smartrecruiters.com/v1/companies/{slug}/postings
 * 
 * No API key required. Free and unlimited.
 */

import { isRelevantJob } from '../utils/job-filter';

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

const SMARTRECRUITERS_COMPANIES = [
    // === ADDED 2026-02-20 — Production DB apply_link mining ===
    // 3 with PMHNP jobs in sample
    { slug: 'karecruitinginc', name: 'K.A. Recruiting' },                  // 60 total, 7 PMHNP
    { slug: 'oleskyassociates', name: 'Olesky Associates' },                // 299 total, 7 PMHNP
    { slug: 'newyorkpsychotherapyandcounselingcenter', name: 'NY Psychotherapy & Counseling' }, // 11 total, 6 PMHNP

    // 3 alive, monitoring for PMHNP
    { slug: 'internationalsosgovernmentmedicalservices', name: 'International SOS' },   // 598 total
    { slug: 'kittitasvalleyhealthcare', name: 'Kittitas Valley Healthcare' },           // 63 total
    { slug: 'mascmedicalrecruitmentfirm', name: 'MASC Medical' },                      // 82 total
];

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
        // Strip HTML tags
        return parts.join('\n\n').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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

            // Pre-filter: check title for PMHNP relevance before fetching descriptions
            for (const posting of postings) {
                const titleRelevant = isRelevantJob(posting.name, '');

                if (titleRelevant) {
                    // Fetch full description for relevant jobs
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
