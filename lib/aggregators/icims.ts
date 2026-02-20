/**
 * iCIMS Direct Scraper
 * 
 * Fetches jobs from iCIMS career sites via HTML scraping.
 * Endpoint: https://{slug}.icims.com/jobs/search?searchKeyword=psychiatric+nurse+practitioner
 * 
 * Job links use class="iCIMS_Anchor" with title="jobId - Job Title | Location"
 * 
 * No API key required. Free.
 */

import { isRelevantJob } from '../utils/job-filter';

export interface ICIMSJobRaw {
    externalId: string;
    title: string;
    company: string;
    location: string;
    description: string;
    applyLink: string;
}

const ICIMS_COMPANIES = [
    // === ADDED 2026-02-20 — Production DB apply_link mining ===
    { slug: 'careers2-universalhealthservices', name: 'Universal Health Services' },   // 16 PMHNP jobs
    { slug: 'facilityjobs-acadiahealthcare', name: 'Acadia Healthcare' },             // 10 job links
    { slug: 'careers-vhchealth', name: 'VHC Health' },                               // monitoring
];

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch job description from iCIMS job detail page
 */
async function fetchJobDescription(jobUrl: string): Promise<string> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(jobUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) return '';
        const html = await res.text();

        // Extract description from iCIMS detail page
        // iCIMS uses class="iCIMS_InfoMsg_Job" for the description
        const descMatch = html.match(/class="iCIMS_InfoMsg_Job"[^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch) {
            return descMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        }

        // Fallback: try to get all text content from the job body
        const bodyMatch = html.match(/class="iCIMS_JobContent[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        if (bodyMatch) {
            return bodyMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        }

        return '';
    } catch {
        return '';
    }
}

/**
 * Fetch jobs from a single iCIMS company
 */
async function fetchCompanyJobs(company: { slug: string; name: string }): Promise<ICIMSJobRaw[]> {
    // Search for psychiatric nurse practitioner jobs
    const searchTerms = [
        'psychiatric+nurse+practitioner',
        'PMHNP',
    ];

    const allJobs: ICIMSJobRaw[] = [];
    const seenIds = new Set<string>();

    for (const searchTerm of searchTerms) {
        const url = `https://${company.slug}.icims.com/jobs/search?ss=1&searchKeyword=${searchTerm}&in_iframe=1`;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 12000);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);

            if (!res.ok) {
                console.warn(`[iCIMS] ${company.name}: HTTP ${res.status} for "${searchTerm}"`);
                continue;
            }

            const html = await res.text();

            // Parse job links: <a href="...icims.com/jobs/XXXX/..." class="iCIMS_Anchor" title="XXXX - Job Title | Location">
            const linkRegex = /<a\s+href="(https?:\/\/[^"]*\.icims\.com\/jobs\/(\d+)\/[^"]*)"[^>]*class="iCIMS_Anchor"[^>]*title="([^"]*)"[^>]*>/gi;
            let match;

            while ((match = linkRegex.exec(html)) !== null) {
                const jobUrl = match[1].replace(/\?in_iframe=1/, '');
                const jobId = match[2];
                const titleAttr = match[3];

                if (seenIds.has(jobId)) continue;
                seenIds.add(jobId);

                // Parse title attribute: "jobId - Job Title | Location" or "jobId - Job Title"
                const titleMatch = titleAttr.match(/^\d+\s*-\s*(.+?)(?:\|(.+))?$/);
                let title = titleMatch ? titleMatch[1].trim() : titleAttr;
                let location = titleMatch?.[2]?.trim() || 'United States';

                // Check PMHNP relevance
                if (!isRelevantJob(title, '')) continue;

                // Fetch description
                const description = await fetchJobDescription(jobUrl);
                await sleep(200);

                allJobs.push({
                    externalId: `icims-${company.slug}-${jobId}`,
                    title,
                    company: company.name,
                    location,
                    description,
                    applyLink: jobUrl,
                });
            }

            await sleep(300);
        } catch (error) {
            console.warn(`[iCIMS] ${company.name}: Error searching "${searchTerm}" -`, error);
        }
    }

    console.log(`[iCIMS] ${company.name}: ${allJobs.length} PMHNP jobs found`);
    return allJobs;
}

/**
 * Fetch PMHNP jobs from all iCIMS companies
 */
export async function fetchICIMSJobs(): Promise<ICIMSJobRaw[]> {
    console.log(`[iCIMS] Scanning ${ICIMS_COMPANIES.length} company career sites...`);

    const allJobs: ICIMSJobRaw[] = [];

    for (const company of ICIMS_COMPANIES) {
        const jobs = await fetchCompanyJobs(company);
        allJobs.push(...jobs);
        await sleep(500);
    }

    console.log(`[iCIMS] Total: ${allJobs.length} PMHNP jobs found across all companies`);
    return allJobs;
}
