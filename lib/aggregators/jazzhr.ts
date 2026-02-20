/**
 * JazzHR (Resumator) Direct Scraper
 * 
 * Fetches jobs from JazzHR via their widget/embed API.
 * Endpoint: https://app.jazz.co/widgets/basic/create/{slug}
 * 
 * Also tries the JSON feed at:
 *   https://{slug}.applytojob.com/apply/jobs
 * 
 * No API key required. Free.
 */

import { isRelevantJob } from '../utils/job-filter';

export interface JazzHRJobRaw {
    externalId: string;
    title: string;
    company: string;
    location: string;
    description: string;
    applyLink: string;
    postedDate?: string;
}

const JAZZHR_COMPANIES = [
    // === ADDED 2026-02-20 — Production DB apply_link mining ===
    { slug: 'applewoodcenters', name: 'Applewood Centers' },                     // 42 jobs, PMHNP YES
    { slug: 'mastercenterforaddictionmedicine', name: 'Master Center for Addiction Medicine' }, // 27 jobs, PMHNP YES
];

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch jobs from a single JazzHR company via their widget page
 */
async function fetchCompanyJobs(company: { slug: string; name: string }): Promise<JazzHRJobRaw[]> {
    const url = `https://app.jazz.co/widgets/basic/create/${company.slug}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) {
            console.warn(`[JazzHR] ${company.name}: HTTP ${res.status}`);
            return [];
        }

        const html = await res.text();

        // Parse job listings from the HTML widget
        // JazzHR widget uses <li> elements with class "resumator-job" or similar
        const jobs: JazzHRJobRaw[] = [];

        // Try to find job entries — JazzHR uses various HTML patterns
        // Pattern 1: Direct link parsing with job titles
        const jobRegex = /<a[^>]*href="(https?:\/\/[^"]*applytojob\.com[^"]*)"[^>]*>([^<]+)<\/a>/gi;
        let match;
        const seen = new Set<string>();

        // Also try to find the JSON data embedded in the page
        const jsonMatch = html.match(/var\s+jobs\s*=\s*(\[[\s\S]*?\]);/);
        if (jsonMatch) {
            try {
                const jobsData = JSON.parse(jsonMatch[1]) as Array<{
                    id: string;
                    title: string;
                    city?: string;
                    state?: string;
                    description?: string;
                    board_code?: string;
                }>;

                for (const job of jobsData) {
                    const title = job.title || '';
                    if (!isRelevantJob(title, job.description || '')) continue;

                    const location = [job.city, job.state].filter(Boolean).join(', ') || 'United States';
                    const applyLink = `https://${company.slug}.applytojob.com/apply/${job.id}`;

                    jobs.push({
                        externalId: `jazzhr-${company.slug}-${job.id}`,
                        title,
                        company: company.name,
                        location,
                        description: job.description || '',
                        applyLink,
                    });
                }

                console.log(`[JazzHR] ${company.name}: ${jobs.length} PMHNP jobs found via JSON (${jobsData.length} total)`);
                return jobs;
            } catch {
                // JSON parse failed, fall through to HTML parsing
            }
        }

        // Fall back to HTML link parsing
        while ((match = jobRegex.exec(html)) !== null) {
            const applyLink = match[1];
            const title = match[2].trim();

            if (seen.has(applyLink)) continue;
            seen.add(applyLink);

            if (!isRelevantJob(title, '')) continue;

            // Extract job ID from URL
            const idMatch = applyLink.match(/\/apply\/([a-zA-Z0-9]+)/);
            const jobId = idMatch ? idMatch[1] : title.replace(/\s+/g, '-').toLowerCase();

            jobs.push({
                externalId: `jazzhr-${company.slug}-${jobId}`,
                title,
                company: company.name,
                location: 'United States', // JazzHR widget doesn't always show location
                description: '', // Will be filled by normalizer if needed
                applyLink,
            });
        }

        // Also try the newer pattern with data attributes
        const dataRegex = /data-title="([^"]+)"[^>]*data-url="([^"]+)"/gi;
        while ((match = dataRegex.exec(html)) !== null) {
            const title = match[1].trim();
            const applyLink = match[2];

            if (seen.has(applyLink)) continue;
            seen.add(applyLink);

            if (!isRelevantJob(title, '')) continue;

            const idMatch = applyLink.match(/\/apply\/([a-zA-Z0-9]+)/);
            const jobId = idMatch ? idMatch[1] : title.replace(/\s+/g, '-').toLowerCase();

            jobs.push({
                externalId: `jazzhr-${company.slug}-${jobId}`,
                title,
                company: company.name,
                location: 'United States',
                description: '',
                applyLink,
            });
        }

        console.log(`[JazzHR] ${company.name}: ${jobs.length} PMHNP jobs found via HTML (total links parsed: ${seen.size})`);
        return jobs;
    } catch (error) {
        console.warn(`[JazzHR] ${company.name}: Error -`, error);
        return [];
    }
}

/**
 * Fetch PMHNP jobs from all JazzHR companies
 */
export async function fetchJazzHRJobs(): Promise<JazzHRJobRaw[]> {
    console.log(`[JazzHR] Scanning ${JAZZHR_COMPANIES.length} company career sites...`);

    const allJobs: JazzHRJobRaw[] = [];

    for (const company of JAZZHR_COMPANIES) {
        const jobs = await fetchCompanyJobs(company);
        allJobs.push(...jobs);
        await sleep(500);
    }

    console.log(`[JazzHR] Total: ${allJobs.length} PMHNP jobs found across all companies`);
    return allJobs;
}
