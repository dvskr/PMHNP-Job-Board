/**
 * City Narrative — deterministic per-(city, taxonomy) content snippets.
 *
 * Goal: defeat Google's "Crawled — currently not indexed" thin-content flag
 * by giving every indexable pSEO page a substantively unique 2–4 sentence
 * paragraph driven by structured facts. Two pages with the same (city,
 * taxonomy) pair will read the same; any other pair produces measurably
 * different text because the fact mix differs.
 *
 * Layer 1 (this file): zero-LLM, deterministic templates assembled from
 *   - city facts (population, COL, MH shortage, healthcare systems, income)
 *   - state facts (practice authority + state-specific details)
 *   - taxonomy-specific lead phrase
 *
 * Layer 2 (DB override, see prisma CitySnippet/CategoryCitySnippet models):
 *   - Optional Claude-generated richer prose for top cities
 *   - Renderer prefers DB override; falls back to Layer 1
 */
import { CityData } from './city-data/types';
import {
    getStatePracticeAuthority,
    PracticeAuthority,
} from '@/lib/state-practice-authority';

// ─── Tiers (used by templates to pick phrasing) ─────────────────────────────

type PopulationTier = 'major-metro' | 'large-city' | 'mid-size' | 'small-city';
type CostTier = 'high-cost' | 'above-avg' | 'average' | 'below-avg' | 'low-cost';

function populationTier(pop: number): PopulationTier {
    if (pop >= 1_000_000) return 'major-metro';
    if (pop >= 250_000) return 'large-city';
    if (pop >= 50_000) return 'mid-size';
    return 'small-city';
}

function costTier(col: number): CostTier {
    if (col >= 130) return 'high-cost';
    if (col >= 110) return 'above-avg';
    if (col >= 95) return 'average';
    if (col >= 85) return 'below-avg';
    return 'low-cost';
}

// ─── Fact provider ──────────────────────────────────────────────────────────

export interface CityNarrativeFacts {
    city: CityData;
    populationTier: PopulationTier;
    costTier: CostTier;
    practiceAuthority: PracticeAuthority | null;
    practiceDetails: string | null;
    shortage: boolean;
    topEmployers: string[];
}

export function buildCityFacts(city: CityData): CityNarrativeFacts {
    const auth = getStatePracticeAuthority(city.state);
    return {
        city,
        populationTier: populationTier(city.population),
        costTier: costTier(city.costOfLivingIndex),
        practiceAuthority: auth?.authority ?? null,
        practiceDetails: auth?.details ?? null,
        shortage: city.mentalHealthShortage,
        topEmployers: (city.healthcareSystems ?? []).slice(0, 3),
    };
}

// ─── Phrase fragments ───────────────────────────────────────────────────────
// Each of these gets composed into the final narrative. Centralized so we
// have ONE source of truth for the language; future regenerations / LLM
// refinements can replace these without touching the assembly logic.

const POPULATION_PHRASES: Record<PopulationTier, string> = {
    'major-metro': 'major metropolitan area',
    'large-city': 'large urban center',
    'mid-size': 'mid-sized regional hub',
    'small-city': 'smaller community',
};

const COST_PHRASES: Record<CostTier, string> = {
    'high-cost': 'high cost of living relative to the national average',
    'above-avg': 'above-average cost of living',
    'average': 'cost of living near the national average',
    'below-avg': 'below-average cost of living',
    'low-cost': 'low cost of living relative to the national average',
};

const AUTHORITY_PHRASES: Record<PracticeAuthority, string> = {
    full: 'full practice authority',
    reduced: 'reduced practice authority requiring a collaborative agreement',
    restricted: 'restricted practice authority requiring physician supervision',
};

// ─── Base city narrative (used by /jobs/city/{slug}) ────────────────────────

export function buildCityNarrative(
    facts: CityNarrativeFacts,
    totalJobs: number,
): string {
    const { city, populationTier: pt, costTier: ct, practiceAuthority, shortage, topEmployers } = facts;
    const parts: string[] = [];

    // Sentence 1: position + state context.
    const popPhrase = POPULATION_PHRASES[pt];
    const authPhrase = practiceAuthority ? AUTHORITY_PHRASES[practiceAuthority] : 'state-specific practice rules';
    parts.push(
        `Demand for psychiatric mental health nurse practitioners in ${city.name}, ${city.stateCode} reflects the area's status as a ${popPhrase} within ${city.state}, where PMHNPs operate under ${authPhrase}.`,
    );

    // Sentence 2: economic + shortage context — drives the salary-comp framing.
    const colPhrase = COST_PHRASES[ct];
    if (shortage) {
        parts.push(
            `The federal HRSA designates ${city.name} as a Mental Health Professional Shortage Area, so positions here are typically eligible for NHSC Loan Repayment and federal loan forgiveness programs. The local ${colPhrase} (index ${city.costOfLivingIndex}) factors directly into compensation expectations.`,
        );
    } else {
        parts.push(
            `${city.name} is not currently a federally designated mental health shortage area, but regional psychiatric demand and the local ${colPhrase} (index ${city.costOfLivingIndex}) shape PMHNP compensation in the market.`,
        );
    }

    // Sentence 3: employer landscape + counts (only when we have a non-empty list).
    if (topEmployers.length > 0) {
        const employerPhrase = topEmployers.length === 1
            ? topEmployers[0]
            : topEmployers.length === 2
                ? `${topEmployers[0]} and ${topEmployers[1]}`
                : `${topEmployers.slice(0, -1).join(', ')}, and ${topEmployers[topEmployers.length - 1]}`;
        parts.push(
            `Major healthcare employers in the ${city.name} area include ${employerPhrase}, alongside ${totalJobs} active PMHNP ${totalJobs === 1 ? 'position' : 'positions'} listed on this page.`,
        );
    } else {
        parts.push(
            `${totalJobs} active PMHNP ${totalJobs === 1 ? 'position is' : 'positions are'} currently listed on this page from a mix of regional employers.`,
        );
    }

    return parts.join(' ');
}

// ─── Taxonomy-specific lead phrases ─────────────────────────────────────────
// One per taxonomy. Each is keyed off CityNarrativeFacts so the lead is also
// (slightly) city-aware where that's useful (e.g. major-metro VAs differ
// from rural ones in compensation profile).

type TaxonomyLeadFn = (facts: CityNarrativeFacts) => string;

const TAXONOMY_LEADS: Record<string, TaxonomyLeadFn> = {
    'remote': (f) => `Remote PMHNP positions covering patients in ${f.city.stateCode} typically pay $130K–$200K+ and require active state licensure plus a HIPAA-compliant home setup. Many roles offer DEA-registered prescribing across multiple states via the Nurse Licensure Compact.`,
    'telehealth': (f) => `Telehealth PMHNP roles serving ${f.city.name} and the wider ${f.city.state} market generally combine asynchronous documentation with scheduled video visits. Most employers require HIPAA-compliant equipment and at least one state license; multi-state Compact licensure expands earning potential.`,
    'inpatient': (f) => `Inpatient PMHNP positions in ${f.city.name} cover acute psychiatric units, consult-liaison services, and crisis stabilization roles. Shift differentials, weekend premiums, and on-call stipends are common in addition to base salary.`,
    'outpatient': (f) => `Outpatient PMHNP roles in ${f.city.name} span community mental health centers, group practices, and integrated primary-care settings. Typical caseloads run 12–18 patients per day with documentation time built in.`,
    'travel': (f) => `Travel PMHNP assignments routed through ${f.city.name} are usually 8–26 weeks with tax-free housing stipends, completion bonuses, and 20–50% premium pay over permanent equivalents. Most agencies handle multi-state licensure logistics.`,
    'full-time': (f) => `Full-time PMHNP positions in ${f.city.name} typically offer comprehensive benefits — health, dental, vision, retirement match, malpractice coverage, and 4–6 weeks of PTO — alongside base salaries calibrated to ${COST_PHRASES[f.costTier]}.`,
    'part-time': (f) => `Part-time PMHNP roles in ${f.city.name} commonly run 16–32 hours per week with prorated benefits or 1099 contractor structure. Many providers stack part-time roles across telehealth and in-person sites for schedule flexibility.`,
    'contract': (f) => `Contract PMHNP positions in ${f.city.name} are typically 1099 engagements paying $90–$150 per hour. Contractors handle their own self-employment tax, malpractice insurance, and quarterly estimated payments — but retain higher take-home than equivalent W-2 roles.`,
    'addiction': (f) => `Addiction-focused PMHNP roles in ${f.city.name} require a DEA X-waiver for buprenorphine prescribing and frequently involve medication-assisted treatment (MAT) programs. NHSC loan repayment is broadly available for substance-use treatment positions.`,
    'new-grad': (f) => `New-graduate PMHNP openings in ${f.city.name} typically include 6–12 months of structured supervision, dedicated preceptor time, and a slower initial caseload ramp. Most employers in ${f.city.state} accept applicants within 6 months of board certification.`,
    '1099': (f) => `1099 / independent-contractor PMHNP arrangements in ${f.city.name} pay $80–$150 per hour with no benefits but full schedule autonomy. Contractors must carry their own tail-coverage malpractice and budget ~30% for self-employment tax.`,
    'behavioral-health': (f) => `Behavioral health PMHNP positions in ${f.city.name} cover the full DSM-5 spectrum — mood, anxiety, psychotic, and trauma-related disorders — across outpatient and integrated care settings.`,
    'correctional': (f) => `Correctional PMHNP roles serving facilities in or near ${f.city.name} often offer state-employee benefits, robust pension plans, and forgiveness of educational debt through state-specific programs in addition to NHSC.`,
    'child-adolescent': (f) => `Child & adolescent PMHNP positions in ${f.city.name} typically require completion of a CAPMHNP post-graduate certificate or equivalent supervised hours. Caseloads weight heavily toward ADHD, anxiety, depression, and autism-spectrum care.`,
    'community-health': (f) => `Community-health PMHNP roles in ${f.city.name} are based at FQHCs and similar safety-net providers. Most positions qualify for NHSC Loan Repayment ($50,000+ over a 2-year commitment) and 340B drug-pricing infrastructure expands medication access for patients.`,
    'crisis': (f) => `Crisis PMHNP positions in ${f.city.name} cover psychiatric emergency departments, mobile crisis teams, and 988 follow-up programs. Pay differentials for evening, overnight, and holiday coverage are standard.`,
    'entry-level': (f) => `Entry-level PMHNP openings in ${f.city.name} usually accept applicants within 1–2 years of board certification and include structured onboarding plus access to senior PMHNP mentorship for the first year.`,
    'geriatric': (f) => `Geriatric PMHNP roles in ${f.city.name} commonly serve long-term care facilities, memory-care units, and home-based primary care. Reimbursement leans on Medicare structures and often includes per-visit RVU bonuses.`,
    'hospital': (f) => `Hospital-based PMHNP positions in ${f.city.name} include consult-liaison, inpatient psychiatry, and emergency psychiatric assessment roles. Most carry shift differentials, on-call stipends, and CME funding.`,
    'lgbtq': (f) => `LGBTQ-affirming PMHNP roles in ${f.city.name} typically focus on gender-affirming psychiatric care, minority stress, and integrated behavioral health within community-centered practices.`,
    'locum-tenens': (f) => `Locum tenens PMHNP coverage in ${f.city.name} pays $90–$160 per hour with malpractice and travel costs covered by the agency. Assignments range from 4–26 weeks and are common for filling permanent-hire gaps.`,
    'mid-career': (f) => `Mid-career PMHNP openings in ${f.city.name} target providers with 3–7 years of post-certification experience and typically include leadership-track compensation, lead-clinician roles, or expanded scope responsibilities.`,
    'per-diem': (f) => `Per-diem PMHNP shifts in ${f.city.name} pay $80–$130 per hour without scheduled commitment. Most providers stack per-diem coverage with a primary employer for income smoothing.`,
    'private-practice': (f) => `Private-practice PMHNP opportunities in ${f.city.name} include solo, group, and concierge models. Self-employed practitioners typically retain 65–75% of collected revenue after overhead, billing, and malpractice.`,
    'senior': (f) => `Senior PMHNP roles in ${f.city.name} target providers with 7+ years of experience and typically include clinical leadership, supervisory authority over new graduates, and stipends for protocol development or quality improvement.`,
    'substance-abuse': (f) => `Substance-use-focused PMHNP positions in ${f.city.name} require a DEA X-waiver for buprenorphine and naltrexone prescribing. MAT programs at FQHCs and addiction clinics frequently qualify for NHSC and HRSA loan repayment.`,
    'va': (f) => `VA PMHNP positions in ${f.city.name} fall on the federal GS-12 to GS-14 pay scale with FEHB health coverage, the Thrift Savings Plan retirement match, and 26 days of paid leave annually. Federal practice authority generally supersedes state restrictions for VA-employed providers.`,
    'veterans': (f) => `Veterans-focused PMHNP roles in ${f.city.name} span VA medical centers, community-based outpatient clinics, and Vet Centers. Roles emphasize PTSD, military sexual trauma, and traumatic brain injury alongside general psychiatric care.`,
};

export function getTaxonomyLead(taxonomy: string, facts: CityNarrativeFacts): string | null {
    const fn = TAXONOMY_LEADS[taxonomy];
    if (!fn) return null;
    return fn(facts);
}

// ─── Taxonomy × city composite narrative ────────────────────────────────────

export function buildTaxonomyCityNarrative(
    facts: CityNarrativeFacts,
    taxonomy: string,
    totalJobs: number,
): string {
    const lead = getTaxonomyLead(taxonomy, facts);
    const cityCtx = buildCityNarrative(facts, totalJobs);
    if (!lead) return cityCtx;
    return `${lead} ${cityCtx}`;
}
