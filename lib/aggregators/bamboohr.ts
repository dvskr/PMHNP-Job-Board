/**
 * BambooHR Direct Scraper
 * 
 * Scrapes BambooHR career pages via their JSON API.
 * Each employer has a GET endpoint at:
 *   https://{slug}.bamboohr.com/careers/list
 * 
 * No API key required. Free and unlimited.
 */

import { isRelevantJob } from '../utils/job-filter';

interface BambooHRJob {
    id: string;
    jobOpeningName: string;
    departmentLabel?: string;
    locationLabelAlt?: string;
    employmentStatusLabel?: string;
}

interface BambooHRJobRaw {
    externalId: string;
    title: string;
    company: string;
    location: string;
    description: string;
    applyLink: string;
    postedDate?: string;
    jobType?: string;
}

// === Verified BambooHR career sites with PMHNP matches ===
// Discovered via scripts/test-all-ats-slugs.ts on 2026-02-16
const BAMBOOHR_COMPANIES = [
    { slug: 'benchmarktherapy', name: 'Benchmark Therapy' },          // 18 PMHNP
    { slug: 'employhealth', name: 'EmployHealth' },                    // 13 PMHNP
    { slug: 'arkoshealth', name: 'Arkos Health' },                     // 10 PMHNP
    { slug: 'cyticlinics', name: 'CyTi Clinics' },                    // 10 PMHNP
    { slug: 'baldwinfamilyhealthcare', name: 'Baldwin Family Health' },// 5 PMHNP
    { slug: 'credentcare', name: 'Credent Care' },                    // 5 PMHNP
    { slug: 'heritagehealthservices', name: 'Heritage Health' },       // 5 PMHNP
    { slug: 'relianthealthcaregroup', name: 'Reliant Healthcare' },    // 5 PMHNP
    { slug: 'bluetreehealth', name: 'Blue Tree Health' },              // 4 PMHNP
    { slug: 'everhomehealthcare', name: 'EverHome Healthcare' },       // 4 PMHNP
    { slug: 'childinspiredtherapy', name: 'Child Inspired Therapy' },  // 3 PMHNP
    { slug: 'caregivergrove', name: 'Caregiver Grove' },               // 2 PMHNP
    { slug: 'eskasonihealthcentre', name: 'Eskasoni Health Centre' },  // 2 PMHNP
    { slug: 'loraincountyhealth', name: 'Lorain County Health' },      // 2 PMHNP
    { slug: 'minneolahealth', name: 'Minneola Healthcare' },           // 2 PMHNP
    { slug: '21stcenturyrehab', name: '21st Century Rehab' },          // 1 PMHNP
    { slug: 'clinicaromero', name: 'Clinica Romero' },                 // 1 PMHNP
    { slug: 'helloavahealth', name: 'Ava Health' },                    // 1 PMHNP
    { slug: 'jsashealthcare', name: 'JSAS Healthcare' },               // 1 PMHNP
    { slug: 'monroehealthcenter', name: 'Monroe Health Center' },      // 1 PMHNP
    { slug: 'noorahealth', name: 'Noora Health' },                     // 1 PMHNP
    { slug: 'tribecapediatrics', name: 'Tribeca Pediatrics' },         // 1 PMHNP

    // === Additional healthcare companies ===
    { slug: 'aclasscare', name: 'AClass Care' },
    { slug: 'aircarehealth', name: 'Air Care Health' },
    { slug: 'brandonclinic', name: 'Brandon Clinic' },
    { slug: 'cabrillohospice', name: 'Cabrillo Hospice' },
    { slug: 'communityneurorehab', name: 'Community NeuroRehab' },
    { slug: 'cubecare', name: 'Cube Care' },
    { slug: 'doximity', name: 'Doximity' },
    { slug: 'eonhealth', name: 'EON Health' },
    { slug: 'extremitycare', name: 'Extremity Care' },
    { slug: 'gifthealthoh', name: 'Gift Health OH' },
    { slug: 'gomedstar', name: 'GoMedStar' },
    { slug: 'healthcaringkw', name: 'HealthCaring KW' },
    { slug: 'healthvisionteam', name: 'Health Vision Team' },
    { slug: 'innovahealth', name: 'Innova Health' },
    { slug: 'ivincihealth', name: 'iVinci Health' },
    { slug: 'mosesbhcare', name: 'Moses BH Care' },
    { slug: 'muensterhospital', name: 'Muenster Hospital' },
    { slug: 'privatemedical', name: 'Private Medical' },
    { slug: 'saferidehealth', name: 'SafeRide Health' },
    { slug: 'salinahealth', name: 'Salina Health' },
    { slug: 'spirithealth', name: 'Spirit Health' },
    { slug: 'therapeuticsinc', name: 'Therapeutics Inc' },
    { slug: 'timelessmedical', name: 'Timeless Medical' },
    { slug: 'truecareny', name: 'TruCare NY' },
    { slug: 'vuehealth', name: 'Vue Health' },
    { slug: 'wildernessmedicalstaffing', name: 'Wilderness Medical Staffing' },
    { slug: 'woundcareadvantage', name: 'Wound Care Advantage' },
];

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch full job description from the BambooHR detail API.
 * Returns stripped text or empty string on failure.
 */
async function fetchJobDescription(companySlug: string, jobId: string): Promise<string> {
    const url = `https://${companySlug}.bamboohr.com/careers/${jobId}/detail`;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) return '';

        const data = await res.json() as { result?: { jobOpening?: { description?: string } } };
        const html = data.result?.jobOpening?.description || '';
        // Strip HTML tags to get plain text for relevance checking
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    } catch {
        return '';
    }
}

/**
 * Check if a job title is a generic NP title that might be a PMHNP role.
 * These titles need description enrichment for accurate filtering.
 */
function isAmbiguousNPTitle(title: string): boolean {
    const lower = title.toLowerCase();
    const hasNP = lower.includes('nurse practitioner') ||
        lower.includes(' np') ||
        lower.includes('aprn') ||
        lower.includes('arnp');
    const alreadyPMHNP = lower.includes('pmhnp') ||
        lower.includes('psychiatric') ||
        lower.includes('psych np') ||
        lower.includes('mental health');
    return hasNP && !alreadyPMHNP;
}

/**
 * Fetch job listings from a single BambooHR company
 */
async function fetchCompanyJobs(company: { slug: string; name: string }): Promise<BambooHRJobRaw[]> {
    const url = `https://${company.slug}.bamboohr.com/careers/list`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
            console.warn(`[BambooHR] ${company.name}: HTTP ${res.status}`);
            return [];
        }

        const data = await res.json() as { result?: BambooHRJob[] };
        const jobs = data.result || [];

        const relevant: BambooHRJobRaw[] = [];

        for (const job of jobs) {
            const title = job.jobOpeningName || '';
            const location = job.locationLabelAlt || '';
            const department = job.departmentLabel || '';
            const baseDescription = `${department} ${title}`;

            // Pass 1: Check relevance with title + department info
            if (isRelevantJob(title, baseDescription)) {
                relevant.push({
                    externalId: `bamboohr-${company.slug}-${job.id}`,
                    title,
                    company: company.name,
                    location,
                    description: baseDescription,
                    applyLink: `https://${company.slug}.bamboohr.com/careers/${job.id}`,
                    jobType: job.employmentStatusLabel || undefined,
                });
                continue;
            }

            // Pass 2: For ambiguous NP titles, fetch full description and re-check
            if (isAmbiguousNPTitle(title)) {
                const fullDescription = await fetchJobDescription(company.slug, job.id);
                if (fullDescription && isRelevantJob(title, fullDescription)) {
                    relevant.push({
                        externalId: `bamboohr-${company.slug}-${job.id}`,
                        title,
                        company: company.name,
                        location,
                        description: fullDescription.substring(0, 2000),
                        applyLink: `https://${company.slug}.bamboohr.com/careers/${job.id}`,
                        jobType: job.employmentStatusLabel || undefined,
                    });
                }
                // Small delay between detail fetches
                await sleep(150);
            }
        }

        if (relevant.length > 0) {
            console.log(`[BambooHR] ${company.name}: ${relevant.length} PMHNP jobs found (${jobs.length} total)`);
        }

        return relevant;
    } catch (error) {
        console.warn(`[BambooHR] ${company.name}: Error fetching jobs:`, error);
        return [];
    }
}

/**
 * Fetch PMHNP jobs from all BambooHR companies
 * Uses parallel batches to stay within Vercel timeout limits
 */
export async function fetchBambooHRJobs(): Promise<BambooHRJobRaw[]> {
    console.log(`[BambooHR] Scanning ${BAMBOOHR_COMPANIES.length} company career sites...`);

    const allJobs: BambooHRJobRaw[] = [];
    const BATCH_SIZE = 10; // Process 10 companies in parallel

    for (let i = 0; i < BAMBOOHR_COMPANIES.length; i += BATCH_SIZE) {
        const batch = BAMBOOHR_COMPANIES.slice(i, i + BATCH_SIZE);

        const results = await Promise.allSettled(
            batch.map(company => fetchCompanyJobs(company))
        );

        for (const result of results) {
            if (result.status === 'fulfilled') {
                allJobs.push(...result.value);
            }
        }

        // Small delay between batches to be polite
        if (i + BATCH_SIZE < BAMBOOHR_COMPANIES.length) {
            await sleep(300);
        }
    }

    console.log(`[BambooHR] Total: ${allJobs.length} PMHNP jobs found across all companies`);
    return allJobs;
}
