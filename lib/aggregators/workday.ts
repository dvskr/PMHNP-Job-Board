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
    // === ORIGINAL (pre-2026-02-16) ===
    { slug: 'trinityhealth', instance: 1, site: 'jobs', name: 'Trinity Health' },
    { slug: 'memorialhermann', instance: 5, site: 'External', name: 'Memorial Hermann' },
    { slug: 'sharp', instance: 1, site: 'External', name: 'Sharp HealthCare' },
    { slug: 'lifestance', instance: 5, site: 'Careers', name: 'LifeStance Health' },
    { slug: 'chghealthcare', instance: 1, site: 'External', name: 'CHG Healthcare' },

    // === ADDED 2026-02-16 — ATS Discovery Script ===
    { slug: 'aah', instance: 5, site: 'External', name: 'Advocate Health' },
    { slug: 'ms', instance: 5, site: 'External', name: 'Mount Sinai' },
    { slug: 'carbonhealth', instance: 1, site: 'Careers', name: 'Carbon Health' },
    { slug: 'mc', instance: 1, site: 'External', name: 'Mayo Clinic' },

    // === ADDED 2026-02-16 — Verified CSV (Hospitals & Health Systems) ===
    { slug: 'adventhealth', instance: 12, site: 'AH_External_Career_Site', name: 'AdventHealth' },
    { slug: 'allina', instance: 5, site: 'External', name: 'Allina Health' },
    { slug: 'archildrens', instance: 1, site: 'External_Career_Site', name: "Arkansas Children's" },
    { slug: 'bannerhealth', instance: 108, site: 'Careers', name: 'Banner Health' },
    { slug: 'baptistfirst', instance: 12, site: 'baptistfirst', name: 'Baptist Health (AL)' },
    { slug: 'bhs', instance: 1, site: 'careers', name: 'Baptist Health (KY)' },
    { slug: 'easyservice', instance: 5, site: 'MercyHealthCareers', name: 'Bon Secours Mercy Health' },
    { slug: 'bronsonhg', instance: 1, site: 'newhires', name: 'Bronson Healthcare' },
    { slug: 'carilionclinic', instance: 12, site: 'External_Careers', name: 'Carilion Clinic' },
    { slug: 'chaptershealth', instance: 5, site: 'jobs', name: 'Chapters Health System' },
    { slug: 'choc', instance: 5, site: 'Careers', name: 'CHOC' },
    { slug: 'cincinnatichildrens', instance: 5, site: 'careersatcincinnatichildrens', name: "Cincinnati Children's" },
    { slug: 'ccf', instance: 1, site: 'ClevelandClinicCareers', name: 'Cleveland Clinic' },
    { slug: 'cookchildrens', instance: 1, site: 'Careers', name: "Cook Children's" },
    { slug: 'spectrumhealth', instance: 5, site: 'CorewellHealthCareers', name: 'Corewell Health' },
    { slug: 'coxhealth', instance: 5, site: 'CoxHealth_External', name: 'CoxHealth' },
    { slug: 'davita', instance: 1, site: 'DKC_External', name: 'DaVita' },
    { slug: 'denverhealth', instance: 1, site: 'DHHA-Main', name: 'Denver Health' },
    { slug: 'nshs', instance: 1, site: 'ns-eeh', name: 'Endeavor Health' },
    { slug: 'gbmc', instance: 1, site: 'GBMC', name: 'GBMC HealthCare' },
    { slug: 'geisinger', instance: 5, site: 'GeisingerExternal', name: 'Geisinger' },
    { slug: 'gohealthuc', instance: 12, site: 'External', name: 'GoHealth Urgent Care' },
    { slug: 'halifaxhealth', instance: 12, site: 'HalifaxHealth', name: 'Halifax Health' },
    { slug: 'hshs', instance: 1, site: 'hshscareers', name: 'Hospital Sisters Health' },
    { slug: 'imh', instance: 108, site: 'IntermountainCareers', name: 'Intermountain Health' },
    { slug: 'jeffersonhealth', instance: 5, site: 'ThomasJeffersonExternal', name: 'Jefferson Health' },
    { slug: 'luriechildrens', instance: 1, site: 'externalportal', name: "Lurie Children's" },
    { slug: 'massgeneralbrigham', instance: 1, site: 'MGBExternal', name: 'Mass General Brigham' },
    { slug: 'memorialhealthcare', instance: 1, site: 'MHS_Careers', name: 'Memorial Healthcare (FL)' },
    { slug: 'multicare', instance: 1, site: 'multicare', name: 'MultiCare Health' },
    { slug: 'nationwidechildrens', instance: 5, site: 'NCHCareers', name: "Nationwide Children's" },
    { slug: 'ochsner', instance: 1, site: 'Ochsner', name: 'Ochsner Health' },
    { slug: 'oumedicine', instance: 5, site: 'OUHealthCareers', name: 'OU Health' },
    { slug: 'rrhs', instance: 5, site: 'RRH', name: 'Rochester Regional Health' },
    { slug: 'sanford', instance: 5, site: 'SanfordHealth', name: 'Sanford Health' },
    { slug: 'sentara', instance: 1, site: 'SCS', name: 'Sentara Healthcare' },
    { slug: 'ssmh', instance: 5, site: 'ssmhealth', name: 'SSM Health' },
    { slug: 'stanfordhealthcare', instance: 5, site: 'SHC_External_Career_Site', name: 'Stanford Health Care' },
    { slug: 'sutterhealth', instance: 1, site: 'sh', name: 'Sutter Health' },
    { slug: 'umassmemorial', instance: 1, site: 'Careers', name: 'UMass Memorial Health' },
    { slug: 'uvmhealth', instance: 1, site: 'CVPH', name: 'UVM Health Network' },
    { slug: 'vumc', instance: 1, site: 'vumccareers', name: 'Vanderbilt UMC' },
    { slug: 'wvumedicine', instance: 1, site: 'WVUH', name: 'WVU Medicine' },

    // === ADDED 2026-02-16 — Verified CSV (Health Insurance — hire psychiatric NPs) ===
    { slug: 'elevancehealth', instance: 1, site: 'ANT', name: 'Elevance Health (Anthem)' },
    { slug: 'cigna', instance: 5, site: 'cignacareers', name: 'Cigna' },
    { slug: 'humana', instance: 5, site: 'Humana_External_Career_Site', name: 'Humana' },
    { slug: 'centene', instance: 5, site: 'Centene_External', name: 'Centene' },
    { slug: 'cvshealth', instance: 1, site: 'CVS_Health_Careers', name: 'CVS Health' },
    { slug: 'highmarkhealth', instance: 1, site: 'highmark', name: 'Highmark Health' },

    // === Verified CSV (Healthcare IT — Teladoc uses WD for hiring) ===
    { slug: 'teladoc', instance: 503, site: 'teladochealth_is_hiring', name: 'Teladoc Health' },
    { slug: 'athenahealth', instance: 1, site: 'External', name: 'athenahealth' },

    // === ADDED 2026-02-16 — CSV test: 9 new PMHNP-active ===
    { slug: 'essentiahealth', instance: 1, site: 'essentia_health', name: 'Essentia Health' },  // 11 PMHNP
    { slug: 'solutionhealth', instance: 1, site: 'careers', name: 'Solution Health' },            // 7 PMHNP
    { slug: 'gundersenhealth', instance: 5, site: 'gundersen', name: 'Gundersen Health' },        // 2 PMHNP
    { slug: 'benefis', instance: 1, site: 'External', name: 'Benefis Health System' },            // 2 PMHNP
    { slug: 'mercycare', instance: 1, site: 'External', name: 'Mercy Cedar Rapids' },             // 2 PMHNP
    { slug: 'southshorehealth', instance: 1, site: 'External', name: 'South Shore Health' },      // 2 PMHNP
    { slug: 'verawholehealth', instance: 1, site: 'External', name: 'Vera Whole Health' },        // 2 PMHNP
    { slug: 'bozemanhealth', instance: 1, site: 'bozemanhealthcareers', name: 'Bozeman Health' }, // 1 PMHNP
    { slug: 'hollandhospital', instance: 1, site: 'external', name: 'Holland Hospital' },         // 1 PMHNP

    // === ADDED 2026-02-16 — All live healthcare slugs from CSV ===
    { slug: 'marshfieldclinichealthsystems', instance: 5, site: 'external', name: 'Marshfieldclinichealthsystems' },
    { slug: 'pullmanregionalhospital', instance: 1, site: 'External', name: 'Pullmanregionalhospital' },
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
 * Total number of chunks for Workday (69 companies / ~14 per chunk = 5)
 */
export const WORKDAY_TOTAL_CHUNKS = 5;
const WORKDAY_CHUNK_SIZE = Math.ceil(WORKDAY_COMPANIES.length / WORKDAY_TOTAL_CHUNKS);

/**
 * Fetch PMHNP jobs from Workday companies (supports chunked execution)
 * @param options.chunk - Chunk index (0-4). If omitted, processes all companies.
 */
export async function fetchWorkdayJobs(options?: { chunk?: number }): Promise<WorkdayJobRaw[]> {
    let companies = WORKDAY_COMPANIES;

    // Support chunked execution for Vercel cron timeout limits
    if (options?.chunk !== undefined) {
        const start = options.chunk * WORKDAY_CHUNK_SIZE;
        const end = start + WORKDAY_CHUNK_SIZE;
        companies = WORKDAY_COMPANIES.slice(start, end);
        console.log(`[Workday] Chunk ${options.chunk}/${WORKDAY_TOTAL_CHUNKS - 1}: Processing companies ${start + 1}-${Math.min(end, WORKDAY_COMPANIES.length)} of ${WORKDAY_COMPANIES.length}`);
    }

    console.log(`[Workday] Checking ${companies.length} Workday career sites for PMHNP jobs...`);

    const allJobs: WorkdayJobRaw[] = [];
    const failedCompanies: string[] = [];

    try {
        for (const company of companies) {
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
