
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

    for (const company of ASHBY_COMPANIES) {
        const jobs = await fetchCompanyPostings(company.slug, company.name);
        allJobs.push(...jobs);

        // Small delay to be respectful
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    return allJobs;
}
