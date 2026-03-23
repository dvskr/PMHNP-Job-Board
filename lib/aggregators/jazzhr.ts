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

        // Fall back to HTML parsing — extract structured job blocks
        // JazzHR widget structure:
        //   <div class="resumator-job">
        //     <div class="resumator-job-title">Job Title</div>
        //     <div class="resumator-job-info"><span class="resumator-job-location">Location: </span>City, ST</div>
        //     <div class="resumator-job-view-details"><a href="...applytojob.com/apply/{id}/{Slug}">+ View details</a></div>
        //   </div>

        // Strategy: find each resumator-job block and extract title + location + link
        const jobBlockRegex = /class="resumator-job[\s"][^>]*>([\s\S]*?)(?=<div[^>]*class="resumator-job[\s"]|<div[^>]*class="resumator-department|$)/gi;
        let blockMatch;

        while ((blockMatch = jobBlockRegex.exec(html)) !== null) {
            const block = blockMatch[1];

            // Extract title from resumator-job-title
            const titleMatch = block.match(/class="[^"]*resumator-job-title[^"]*"[^>]*>([^<]+)<\/div>/i);
            if (!titleMatch) continue;
            const title = titleMatch[1].trim();

            // Extract location from resumator-job-location
            const locMatch = block.match(/class="[^"]*resumator-job-location[^"]*"[^>]*>[^<]*<\/span>([^<]+)/i);
            const location = locMatch ? locMatch[1].trim() : 'United States';

            // Extract apply link
            const linkMatch = block.match(/href="(https?:\/\/[^"]*applytojob\.com\/apply\/[^"]+)"/i);
            if (!linkMatch) continue;
            const applyLink = linkMatch[1];

            if (seen.has(applyLink)) continue;
            seen.add(applyLink);

            // Extract job ID from URL
            const idMatch = applyLink.match(/\/apply\/([a-zA-Z0-9]+)/);
            const jobId = idMatch ? idMatch[1] : title.replace(/\s+/g, '-').toLowerCase();

            jobs.push({
                externalId: `jazzhr-${company.slug}-${jobId}`,
                title,
                company: company.name,
                location,
                description: '',
                applyLink,
            });
        }

        // Final fallback: if no block matches, extract titles from URL slugs
        if (jobs.length === 0) {
            const slugRegex = /href="(https?:\/\/[^"]*applytojob\.com\/apply\/([a-zA-Z0-9]+)\/([^?"]+))[^"]*"/gi;
            let slugMatch;
            while ((slugMatch = slugRegex.exec(html)) !== null) {
                const applyLink = slugMatch[1];
                const jobId = slugMatch[2];
                const slugTitle = slugMatch[3].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

                if (jobId === 'embed') continue; // skip embed/form links
                if (seen.has(applyLink)) continue;
                seen.add(applyLink);

                jobs.push({
                    externalId: `jazzhr-${company.slug}-${jobId}`,
                    title: slugTitle,
                    company: company.name,
                    location: 'United States',
                    description: '',
                    applyLink,
                });
            }
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
