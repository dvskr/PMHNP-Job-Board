
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
    // === ADDED 2026-02-16 — Discovered via scripts/discover-lever-ashby.ts ===
    { slug: "sondermind", name: "SonderMind" },         // 150 total jobs
    { slug: "hims-and-hers", name: "Hims & Hers" },     // 101 total jobs
    { slug: "rula", name: "Rula" },                      // 21 total jobs
    { slug: "tavahealth", name: "Tava Health" },         // 10 total jobs
    // === ADDED 2026-02-16 — Full ATS Discovery (189 companies scanned) ===
    { slug: "sesame", name: "Sesame Care" },               // 29 total jobs
    { slug: "wheel", name: "Wheel Health" },               // 7 total jobs
    { slug: "oh", name: "Ochsner Health" },                // 5 total jobs
    { slug: "prime", name: "Prime Healthcare" },           // 3 total jobs
    { slug: "foresight", name: "Foresight Mental Health" },// 3 total jobs

    // === ADDED 2026-02-16 — CSV test: 9 new PMHNP-active slugs ===
    { slug: "bravehealth", name: "Brave Health" },          // 23 PMHNP
    { slug: "visanahealth", name: "Visana Health" },        // 13 PMHNP
    { slug: "finni-health", name: "Finni Health" },         // 5 PMHNP
    { slug: "annaautismcare", name: "Anna Autism Care" },   // 3 PMHNP
    { slug: "claritypediatrics", name: "Clarity Pediatrics" }, // 2 PMHNP
    { slug: "nest-health", name: "Nest Health" },           // 7 PMHNP
    { slug: "cylinderhealth", name: "Cylinder Health" },    // 1 PMHNP
    { slug: "tandem-health", name: "Tandem Health" },       // 1 PMHNP
    { slug: "virtahealth", name: "Virta Health" },          // 1 PMHNP

    // === ADDED 2026-02-16 — All live healthcare slugs from CSV ===
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

    // === BULK ADD — All remaining CSV companies (96) ===
    { slug: "1password", name: "1password" },
    { slug: "abridge", name: "Abridge (Ashby)" },
    { slug: "accurx", name: "Accurx" },
    { slug: "akasa", name: "Akasa" },
    { slug: "alto", name: "Alto Pharmacy (Ashby)" },
    { slug: "ambiencehealthcare", name: "Ambiencehealthcare" },
    { slug: "annaautismcare", name: "Annaautismcare" },
    { slug: "anterior", name: "Anterior" },
    { slug: "august-health", name: "August Health" },
    { slug: "awellhealth", name: "Awell Health" },
    { slug: "babylonlabs", name: "Babylonlabs" },
    { slug: "bariendo", name: "Bariendo" },
    { slug: "bespokelabs", name: "Bespokelabs" },
    { slug: "bioptimizers", name: "Bioptimizers" },
    { slug: "bjakcareer", name: "Bjakcareer" },
    { slug: "blossom-health", name: "Blossom Health" },
    { slug: "branchinsurance", name: "Branchinsurance" },
    { slug: "bravehealth", name: "Bravehealth" },
    { slug: "cambio", name: "Cambio" },
    { slug: "candidhealth", name: "Candidhealth" },
    { slug: "category-labs", name: "Category Labs" },
    { slug: "chainalysis-careers", name: "Chainalysis Careers" },
    { slug: "chainlink-labs", name: "Chainlink Labs" },
    { slug: "characterbio", name: "Characterbio" },
    { slug: "claritypediatrics", name: "Claritypediatrics" },
    { slug: "claylabs", name: "Claylabs" },
    { slug: "commure", name: "Commure/Athelas" },
    { slug: "coursecareers", name: "Coursecareers" },
    { slug: "cradlebio", name: "Cradlebio" },
    { slug: "crossjoin-solutions", name: "Crossjoin Solutions" },
    { slug: "cylinderhealth", name: "Cylinderhealth" },
    { slug: "dandelionhealth", name: "Dandelion Health" },
    { slug: "definelycareers", name: "Definelycareers" },
    { slug: "easygenerator", name: "Easygenerator" },
    { slug: "eigen-labs", name: "Eigen Labs" },
    { slug: "elationhealth", name: "Elation Health" },
    { slug: "elevenlabs", name: "Elevenlabs" },
    { slug: "ellipsislabs", name: "Ellipsislabs" },
    { slug: "finni-health", name: "Finni Health" },
    { slug: "foundationhealthcareers", name: "Foundationhealthcareers" },
    { slug: "fountainlife", name: "Fountain Life" },
    { slug: "frontcareers", name: "Frontcareers" },
    { slug: "general-counsel-ai", name: "General Counsel Ai" },
    { slug: "genesis-ai", name: "Genesis Ai" },
    { slug: "gradient-labs", name: "Gradient Labs" },
    { slug: "handspring", name: "Handspring" },
    { slug: "hike-medical", name: "Hike Medical" },
    { slug: "hims", name: "Hims & Hers (Ashby)" },
    { slug: "hims-and-hers", name: "Hims And Hers" },
    { slug: "hippocraticai", name: "Hippocratic AI" },
    { slug: "iacollaborative", name: "Iacollaborative" },
    { slug: "iambic-therapeutics", name: "Iambic Therapeutics" },
    { slug: "injective-labs", name: "Injective Labs" },
    { slug: "lavendo", name: "Lavendo" },
    { slug: "levelpath", name: "Levelpath" },
    { slug: "lindushealth", name: "Lindushealth" },
    { slug: "lumoshealth", name: "Lumos Health" },
    { slug: "maticrobots", name: "Maticrobots" },
    { slug: "matter-labs", name: "Matter Labs" },
    { slug: "myedspacecareers", name: "Myedspacecareers" },
    { slug: "mystenlabs", name: "Mystenlabs" },
    { slug: "nabla", name: "Nabla" },
    { slug: "nest-health", name: "Nest Health" },
    { slug: "netboxlabs", name: "Netboxlabs" },
    { slug: "nextlinklabs", name: "Nextlinklabs" },
    { slug: "oakslab", name: "Oakslab" },
    { slug: "oplabs", name: "Oplabs" },
    { slug: "orbitalmaterials", name: "Orbitalmaterials" },
    { slug: "oura", name: "Oura" },
    { slug: "pearlhealth", name: "Pearlhealth" },
    { slug: "polygon-labs", name: "Polygon Labs" },
    { slug: "prior-labs", name: "Prior Labs" },
    { slug: "procurementsciences", name: "Procurementsciences" },
    { slug: "pylon-labs", name: "Pylon Labs" },
    { slug: "radai", name: "Rad AI" },
    { slug: "relationrx", name: "Relationrx" },
    { slug: "remedyrobotics", name: "Remedyrobotics" },
    { slug: "risklabs", name: "Risklabs" },
    { slug: "ruby-labs", name: "Ruby Labs" },
    { slug: "socure", name: "Socure" },
    { slug: "springhealth", name: "Spring Health (Ashby)" },
    { slug: "standinsurance", name: "Standinsurance" },
    { slug: "summerhealth", name: "Summer Health" },
    { slug: "symbiotic", name: "Symbiotic" },
    { slug: "tandem-health", name: "Tandem Health" },
    { slug: "tavahealth", name: "Tavahealth" },
    { slug: "twelve-labs", name: "Twelve Labs" },
    { slug: "uipath", name: "Uipath" },
    { slug: "valeriehealth", name: "Valeriehealth" },
    { slug: "versemedical", name: "Versemedical" },
    { slug: "virtahealth", name: "Virtahealth" },
    { slug: "visanahealth", name: "Visanahealth" },
    { slug: "worldlabs", name: "Worldlabs" },
    { slug: "wormholelabs", name: "Wormholelabs" },
    { slug: "wynd-labs", name: "Wynd Labs" },
    { slug: "xlabs", name: "Xlabs" },
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
