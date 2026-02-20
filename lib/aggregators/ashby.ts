
import { isRelevantJob } from '../utils/job-filter';

export interface AshbyJobRaw {
    externalId: string;
    title: string;
    company: string;
    location: string;
    description: string;
    applyLink: string;
    postedDate: string;
    isRemote: boolean;
    minSalary: number | null;
    maxSalary: number | null;
    salaryPeriod: string | null;
}

interface AshbyJob {
    id: string;
    title: string;
    location: string;
    descriptionHtml: string;
    publishedAt: string;
    updatedAt: string;
    jobUrl: string;
    isRemote: boolean;
    compensation?: {
        compensationTierSummary?: string;
    };
    address?: {
        postalAddress?: {
            addressLocality?: string;
            addressRegion?: string;
            addressCountry?: string;
        };
    };
}

interface AshbyResponse {
    jobs: AshbyJob[];
}

const ASHBY_COMPANIES = [
    { slug: "equip", name: "Equip Health" },
    { slug: "ReklameHealth", name: "Reklame Health" },
    { slug: "legionhealth", name: "Legion Health" },
    { slug: "array-behavioral-care", name: "Array Behavioral Care" },
    { slug: "blossom-health", name: "Blossom Health" },
    // === ADDED 2026-02-16 â€” Discovered via scripts/discover-lever-ashby.ts ===
    { slug: "sondermind", name: "SonderMind" },         // 150 total jobs
    { slug: "hims-and-hers", name: "Hims & Hers" },     // 101 total jobs
    { slug: "rula", name: "Rula" },                      // 21 total jobs
    { slug: "tavahealth", name: "Tava Health" },         // 10 total jobs
    // === ADDED 2026-02-16 â€” Full ATS Discovery (189 companies scanned) ===
    { slug: "sesame", name: "Sesame Care" },               // 29 total jobs
    { slug: "wheel", name: "Wheel Health" },               // 7 total jobs
    { slug: "oh", name: "Ochsner Health" },                // 5 total jobs
    { slug: "prime", name: "Prime Healthcare" },           // 3 total jobs
    { slug: "foresight", name: "Foresight Mental Health" },// 3 total jobs

    // === ADDED 2026-02-16 â€” CSV test: 9 new PMHNP-active slugs ===
    { slug: "bravehealth", name: "Brave Health" },          // 23 PMHNP
    { slug: "visanahealth", name: "Visana Health" },        // 13 PMHNP
    { slug: "finni-health", name: "Finni Health" },         // 5 PMHNP
    { slug: "annaautismcare", name: "Anna Autism Care" },   // 3 PMHNP
    { slug: "claritypediatrics", name: "Clarity Pediatrics" }, // 2 PMHNP
    { slug: "nest-health", name: "Nest Health" },           // 7 PMHNP
    { slug: "cylinderhealth", name: "Cylinder Health" },    // 1 PMHNP
    { slug: "tandem-health", name: "Tandem Health" },       // 1 PMHNP
    { slug: "virtahealth", name: "Virta Health" },          // 1 PMHNP

    // === ADDED 2026-02-16 â€” All live healthcare slugs from CSV ===
    { slug: "abridge", name: "Abridge" },
    { slug: "akasa", name: "Akasa" },
    { slug: "ambiencehealthcare", name: "Ambiencehealthcare" },
    { slug: "anterior", name: "Anterior" },
    { slug: "august-health", name: "August Health" },
    { slug: "bjakcareer", name: "Bjakcareer" },
    { slug: "candidhealth", name: "Candidhealth" },
    { slug: "chainalysis-careers", name: "Chainalysis Careers" },
    { slug: "commure", name: "Commure" },
    { slug: "coursecareers", name: "Coursecareers" },
    { slug: "definelycareers", name: "Definelycareers" },
    { slug: "foundationhealthcareers", name: "Foundationhealthcareers" },
    { slug: "frontcareers", name: "Frontcareers" },
    { slug: "hike-medical", name: "Hike Medical" },
    { slug: "iambic-therapeutics", name: "Iambic Therapeutics" },
    { slug: "lindushealth", name: "Lindushealth" },
    { slug: "myedspacecareers", name: "Myedspacecareers" },
    { slug: "nabla", name: "Nabla" },
    { slug: "pearlhealth", name: "Pearlhealth" },
    { slug: "radai", name: "Radai" },
    { slug: "valeriehealth", name: "Valeriehealth" },
    { slug: "versemedical", name: "Versemedical" },

    // === Additional healthcare companies ===
    // REMOVED 2026-02-20 — Dead endpoints (HTTP errors in audit):
    // alto, awellhealth, elationhealth, fountainlife, hippocraticai, lumoshealth, oura, springhealth
    { slug: "dandelionhealth", name: "Dandelion Health" },
    { slug: "relationrx", name: "RelationRx" },
    { slug: "summerhealth", name: "Summer Health" },

    // === ADDED 2026-02-20 — Production DB apply_link mining ===
    { slug: "Fort Health", name: "Fort Health" },
];

/**
 * Parses salary from Ashby's compensation tier summary (e.g., "$130K - $180K")
 */
function parseAshbySalary(summary?: string): { min: number | null; max: number | null; period: string | null } {
    if (!summary) return { min: null, max: null, period: null };

    const annualPattern = /\$(\d{1,3}(?:,?\d{3})*(?:k)?)\s*(?:-|to)\s*\$?(\d{1,3}(?:,?\d{3})*(?:k)?)?/i;
    const match = summary.match(annualPattern);

    if (match) {
        const min = match[1].toLowerCase().includes('k')
            ? parseFloat(match[1].replace(/k/i, '').replace(/,/g, '')) * 1000
            : parseFloat(match[1].replace(/,/g, ''));

        const max = match[2]
            ? (match[2].toLowerCase().includes('k')
                ? parseFloat(match[2].replace(/k/i, '').replace(/,/g, '')) * 1000
                : parseFloat(match[2].replace(/,/g, '')))
            : null;

        return { min, max, period: 'year' };
    }

    return { min: null, max: null, period: null };
}

async function fetchCompanyPostings(companySlug: string, companyName: string): Promise<AshbyJobRaw[]> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${companySlug}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`[Ashby] ${companySlug}: Not found (404)`);
                return [];
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const data: AshbyResponse = await response.json();
        const jobs = data.jobs || [];

        // Filter for PMHNP relevance
        const relevantJobs = jobs.filter(job => isRelevantJob(job.title, job.descriptionHtml));

        console.log(`[Ashby] ${companySlug}: ${relevantJobs.length}/${jobs.length} jobs relevant`);

        return relevantJobs.map(job => {
            const salary = parseAshbySalary(job.compensation?.compensationTierSummary);

            // Construct location string
            let location = job.location;
            if (job.address?.postalAddress) {
                const addr = job.address.postalAddress;
                const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean);
                if (parts.length > 0) location = parts.join(', ');
            }

            return {
                externalId: `ashby-${companySlug}-${job.id}`,
                title: job.title,
                company: companyName,
                location: location || (job.isRemote ? 'Remote' : 'United States'),
                description: job.descriptionHtml,
                applyLink: job.jobUrl,
                postedDate: job.publishedAt || job.updatedAt,
                isRemote: job.isRemote,
                minSalary: salary.min,
                maxSalary: salary.max,
                salaryPeriod: salary.period
            };
        });
    } catch (error) {
        console.error(`[Ashby] ${companySlug}: Error -`, error);
        return [];
    }
}

export async function fetchAshbyJobs(): Promise<AshbyJobRaw[]> {
    console.log(`[Ashby] Checking ${ASHBY_COMPANIES.length} companies for PMHNP jobs...`);

    const allJobs: AshbyJobRaw[] = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < ASHBY_COMPANIES.length; i += BATCH_SIZE) {
        const batch = ASHBY_COMPANIES.slice(i, i + BATCH_SIZE);

        const results = await Promise.allSettled(
            batch.map(company => fetchCompanyPostings(company.slug, company.name))
        );

        for (const result of results) {
            if (result.status === 'fulfilled') {
                allJobs.push(...result.value);
            }
        }

        if (i + BATCH_SIZE < ASHBY_COMPANIES.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    return allJobs;
}
