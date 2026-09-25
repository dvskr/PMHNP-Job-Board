/**
 * City Narrative — deterministic per-(city, taxonomy) content snippets.
 *
 * Goal: defeat Google's "Crawled — currently not indexed" thin-content flag
 * by giving every indexable pSEO page a substantively unique 2 to 4 sentence
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

/**
 * @param taxonomyLabel Human label for the taxonomy this body sits under, e.g.
 *   "Inpatient". Supplied only by buildTaxonomyCityNarrative. Without it the
 *   body was byte-identical across every taxonomy page for one city, which is
 *   the near-duplicate cluster Google collapses to a single indexed URL; with
 *   it the closing sentence names and counts the taxonomy actually on screen.
 */
export function buildCityNarrative(
    facts: CityNarrativeFacts,
    totalJobs: number,
    taxonomyLabel?: string,
): string {
    const { city, populationTier: pt, costTier: ct, practiceAuthority, shortage, topEmployers } = facts;
    const parts: string[] = [];
    const roleNoun = taxonomyLabel ? `${taxonomyLabel} PMHNP` : 'PMHNP';

    // Sentence 1: position + state context.
    const popPhrase = POPULATION_PHRASES[pt];
    const authPhrase = practiceAuthority ? AUTHORITY_PHRASES[practiceAuthority] : 'state-specific practice rules';
    parts.push(
        `${roleNoun} demand in ${city.name}, ${city.stateCode}, reflects the area's status as a ${popPhrase} within ${city.state}, where psychiatric mental health nurse practitioners operate under ${authPhrase}.`,
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
            `Major healthcare employers in the ${city.name} area include ${employerPhrase}, alongside ${totalJobs} active ${roleNoun} ${totalJobs === 1 ? 'position' : 'positions'} listed on this page.`,
        );
    } else {
        parts.push(
            `${totalJobs} active ${roleNoun} ${totalJobs === 1 ? 'position is' : 'positions are'} currently listed on this page from a mix of regional employers.`,
        );
    }

    return parts.join(' ');
}

// ─── Taxonomy-specific lead phrases ─────────────────────────────────────────
// One per taxonomy. Every lead MUST branch on at least one fact beyond
// city.name — shortage, population tier, cost tier, top employers, or practice
// authority. The 2026-09 audit found ten leads that interpolated nothing but
// the city name, which makes each taxonomy's lead byte-identical across the
// thousands of cities that carry it: the doorway/scaled-content shape Google
// clusters and drops. tests/pseo/city-narrative-differentiation.test.ts pins
// the rule so a new lead cannot regress it.

const METRO_SCALE_PHRASES: Record<PopulationTier, string> = {
    'major-metro': 'a major metropolitan market',
    'large-city': 'a large urban market',
    'mid-size': 'a mid-sized regional market',
    'small-city': 'a smaller community market',
};

/** True for the tiers where cost pressure, not cost relief, is the story. */
function isExpensive(ct: CostTier): boolean {
    return ct === 'high-cost' || ct === 'above-avg';
}

/** True where the city is dense enough to support a dedicated program. */
function isDense(pt: PopulationTier): boolean {
    return pt === 'major-metro' || pt === 'large-city';
}

type TaxonomyLeadFn = (facts: CityNarrativeFacts) => string;

const TAXONOMY_LEADS: Record<string, TaxonomyLeadFn> = {
    // Licensure for remote and telehealth follows the PATIENT's state. The
    // Nurse Licensure Compact multistate license covers RN and LPN practice
    // only; the separate APRN Compact has not been implemented, so a PMHNP
    // still needs an APRN license in every state they treat in. The site's own
    // state licence posts say this, and the previous copy here said the
    // opposite.
    'remote': (f) => `Remote PMHNP positions covering patients in ${f.city.stateCode} typically pay $130K to $200K+ and require a HIPAA-compliant home setup. Licensure follows the patient: treating ${f.city.name} residents requires an active ${f.city.state} APRN license, because a multistate license issued under the Nurse Licensure Compact covers RN practice only and the separate APRN Compact has not been implemented. ${f.shortage ? `Remote panels covering ${f.city.name} fill quickly, because local demand runs ahead of in-person capacity.` : `Employers hiring into the ${f.city.name} market weigh ${COST_PHRASES[f.costTier]} when they set remote base pay.`}`,
    'telehealth': (f) => `Telehealth PMHNP roles serving ${f.city.name} and the wider ${f.city.state} market generally combine asynchronous documentation with scheduled video visits. Employers require HIPAA-compliant equipment and an active ${f.city.state} APRN license for patients located in the state; a Nurse Licensure Compact multistate license covers RN practice, not APRN practice, so each state you treat in needs its own APRN credential. ${f.topEmployers.length > 0 ? `Local systems including ${f.topEmployers[0]} also run hybrid schedules that pair virtual visits with onsite days.` : `Hybrid schedules that pair virtual visits with onsite days are common in ${METRO_SCALE_PHRASES[f.populationTier]}.`}`,
    'inpatient': (f) => `Inpatient PMHNP positions in ${f.city.name} cover acute psychiatric units, consult-liaison services, and crisis stabilization roles. ${f.topEmployers.length > 0 ? `Acute capacity in the area sits largely with systems including ${f.topEmployers.slice(0, 2).join(' and ')}.` : `In ${METRO_SCALE_PHRASES[f.populationTier]}, acute beds are concentrated in a small number of regional hospitals.`} Shift differentials, weekend premiums, and on-call stipends are common in addition to base salary.`,
    'outpatient': (f) => `Outpatient PMHNP roles in ${f.city.name} span community mental health centers, group practices, and integrated primary-care settings. Typical caseloads run 12 to 18 patients per day with documentation time built in. ${f.shortage ? 'Because the area carries a federal mental health shortage designation, outpatient waitlists run long and many clinics staff extended hours.' : `Panel size and pay track the local ${COST_PHRASES[f.costTier]} (index ${f.city.costOfLivingIndex}).`}`,
    'travel': (f) => `Travel PMHNP assignments routed through ${f.city.name} are usually 8 to 26 weeks with tax-free housing stipends, completion bonuses, and 20 to 50% premium pay over permanent equivalents. Stipend value moves with local housing cost, and ${f.city.name} carries ${COST_PHRASES[f.costTier]} (index ${f.city.costOfLivingIndex}). Agencies handle the ${f.city.stateCode} APRN licensure paperwork on most assignments.`,
    'full-time': (f) => `Full-time PMHNP positions in ${f.city.name} typically offer comprehensive benefits (health, dental, vision, retirement match, malpractice coverage, and 4 to 6 weeks of PTO) alongside base salaries calibrated to ${COST_PHRASES[f.costTier]}. ${f.topEmployers.length > 0 ? `The largest employers hiring on this basis locally include ${f.topEmployers.slice(0, 2).join(' and ')}.` : `In ${METRO_SCALE_PHRASES[f.populationTier]} the employed model still accounts for most psychiatric openings.`}`,
    'part-time': (f) => `Part-time PMHNP roles in ${f.city.name} commonly run 16 to 32 hours per week with prorated benefits or 1099 contractor structure. ${isExpensive(f.costTier) ? `Against ${COST_PHRASES[f.costTier]}, most providers here stack a part-time role with telehealth or per-diem coverage rather than relying on it alone.` : `Against ${COST_PHRASES[f.costTier]}, a single part-time schedule stretches further here than it would in a coastal metro.`}`,
    'contract': (f) => `Contract PMHNP positions in ${f.city.name} are typically 1099 engagements paying $90 to $150 per hour. Contractors handle their own self-employment tax, malpractice insurance, and quarterly estimated payments, but they retain higher take-home than equivalent W-2 roles. ${f.shortage ? 'Shortage-area employers here lean on contract coverage to hold clinics open while permanent searches run.' : `Contract demand in ${METRO_SCALE_PHRASES[f.populationTier]} tracks vacancy cycles at the larger systems.`}`,
    // The Consolidated Appropriations Act of 2023 removed the separate DEA
    // waiver for buprenorphine. The copy here used to tell clinicians to get
    // one, contradicting the site's own MAT certification guide.
    'addiction': (f) => `Addiction-focused PMHNP roles in ${f.city.name} center on medication-assisted treatment (MAT) programs. Buprenorphine prescribing needs only a standard DEA registration, with no separate waiver, and most employers ask for MAT or ASAM training on top of it. ${f.shortage ? 'Substance-use positions here commonly qualify for NHSC loan repayment.' : 'Substance-use positions at qualifying underserved sites commonly carry NHSC loan repayment eligibility.'}`,
    'new-grad': (f) => `New-graduate PMHNP openings in ${f.city.name} typically include 6 to 12 months of structured supervision, dedicated preceptor time, and a slower initial caseload ramp. Most employers in ${f.city.state} accept applicants within 6 months of board certification. ${f.practiceAuthority && f.practiceAuthority !== 'full' ? `${f.city.state} places PMHNPs under ${AUTHORITY_PHRASES[f.practiceAuthority]}, so a first role also has to supply that physician relationship.` : f.topEmployers.length > 0 ? `Formal new-graduate tracks here sit mainly at ${f.topEmployers[0]}.` : 'Formal new-graduate tracks sit mainly at the larger regional employers.'}`,
    '1099': (f) => `1099 (independent contractor) PMHNP arrangements in ${f.city.name} pay $80 to $150 per hour with no benefits but full schedule autonomy. Contractors must carry their own tail-coverage malpractice and budget roughly 30% for self-employment tax. ${isExpensive(f.costTier) ? `Against ${COST_PHRASES[f.costTier]}, the hourly premium over a salaried role has to cover self-funded health insurance before it counts as a raise.` : `Against ${COST_PHRASES[f.costTier]}, the same hourly rate clears more after living costs than it would in a higher-cost metro.`}`,
    'behavioral-health': (f) => `Behavioral health PMHNP positions in ${f.city.name} cover the full DSM-5 spectrum (mood, anxiety, psychotic, and trauma-related disorders) across outpatient and integrated care settings. ${f.shortage ? 'The federal shortage designation over the area means integrated primary-care sites here are actively adding psychiatric capacity.' : `In ${METRO_SCALE_PHRASES[f.populationTier]}, integrated roles tend to sit inside larger primary-care groups rather than standalone behavioral health clinics.`}`,
    'correctional': (f) => `Correctional PMHNP roles serving facilities in or near ${f.city.name} often offer state-employee benefits, robust pension plans, and forgiveness of educational debt through state-specific programs in addition to NHSC. Caseloads in ${METRO_SCALE_PHRASES[f.populationTier]} lean toward detention intake and stabilization rather than long-term therapy.`,
    'child-adolescent': (f) => `Child & adolescent PMHNP positions in ${f.city.name} typically require completion of a CAPMHNP post-graduate certificate or equivalent supervised hours. Caseloads lean heavily toward ADHD, anxiety, depression, and autism-spectrum care. ${f.topEmployers.length > 0 ? `Pediatric and school-based referrals here route mainly through ${f.topEmployers[0]} and the surrounding community agencies.` : 'Referrals route mainly through school districts and community agencies rather than a dedicated pediatric hospital.'}`,
    // NHSC award amounts and service terms are reset by HRSA each cycle, so
    // publishing a fixed dollar figure dates the page and contradicts the FAQ
    // copy that says exactly that.
    'community-health': (f) => `Community-health PMHNP roles in ${f.city.name} are based at FQHCs and similar safety-net providers. Most positions qualify for NHSC Loan Repayment, whose award amounts and service terms HRSA sets each cycle, and 340B drug-pricing infrastructure expands medication access for patients. ${f.shortage ? "The area's federal shortage designation is what makes most local sites eligible." : "Eligibility turns on the individual site's HPSA score rather than on the city as a whole."}`,
    'crisis': (f) => `Crisis PMHNP positions in ${f.city.name} cover psychiatric emergency departments, mobile crisis teams, and 988 follow-up programs. ${isDense(f.populationTier) ? 'At this metro scale, crisis coverage is usually a standing 24/7 rotation with dedicated psychiatric emergency capacity.' : 'At this community scale, crisis coverage is often shared with a regional hub and handled on call rather than from a dedicated unit.'} Pay differentials for evening, overnight, and holiday coverage are standard.`,
    'entry-level': (f) => `Entry-level PMHNP openings in ${f.city.name} usually accept applicants within 1 to 2 years of board certification and include structured onboarding plus access to senior PMHNP mentorship for the first year. ${f.shortage ? 'Shortage-area employers here hire at this experience level more readily than markets with deeper applicant pools.' : `Without a federal shortage designation, competition in ${METRO_SCALE_PHRASES[f.populationTier]} is steadier, so certification plus clinical rotations in the specialty carry weight.`}`,
    'geriatric': (f) => `Geriatric PMHNP roles in ${f.city.name} commonly serve long-term care facilities, memory-care units, and home-based primary care. Reimbursement leans on Medicare structures and often includes per-visit RVU bonuses, so route density matters: ${isDense(f.populationTier) ? 'facilities here sit close enough together to build a full day of visits inside the city.' : 'facilities here are spread out, and most routes cover several surrounding towns.'}`,
    'hospital': (f) => `Hospital-based PMHNP positions in ${f.city.name} include consult-liaison, inpatient psychiatry, and emergency psychiatric assessment roles. ${f.topEmployers.length > 0 ? `${f.topEmployers.slice(0, 2).join(' and ')} anchor the local hospital market.` : 'The local hospital market is anchored by regional systems rather than academic medical centers.'} Most roles carry shift differentials, on-call stipends, and CME funding.`,
    'lgbtq': (f) => `LGBTQ-affirming PMHNP roles in ${f.city.name} typically focus on gender-affirming psychiatric care, minority stress, and integrated behavioral health within community-centered practices. ${isDense(f.populationTier) ? 'At this scale the work usually sits inside a dedicated LGBTQ health program with its own referral base.' : 'At this scale the work is usually one part of a general behavioral health caseload rather than a dedicated program.'}`,
    'locum-tenens': (f) => `Locum tenens PMHNP coverage in ${f.city.name} pays $90 to $160 per hour with malpractice and travel costs covered by the agency. Assignments range from 4 to 26 weeks and are common for filling permanent-hire gaps. ${f.shortage ? 'Those gaps recur here because the area carries a federal mental health shortage designation.' : 'Those gaps here usually follow turnover at the larger local employers rather than a chronic shortfall.'}`,
    'mid-career': (f) => `Mid-career PMHNP openings in ${f.city.name} target providers with 3 to 7 years of post-certification experience and typically include leadership-track compensation, lead-clinician roles, or expanded scope responsibilities. ${f.topEmployers.length > 0 ? `Those tracks exist mainly at the larger employers, including ${f.topEmployers[0]}.` : `In ${METRO_SCALE_PHRASES[f.populationTier]} the step up is more often scope than title.`}`,
    'per-diem': (f) => `Per-diem PMHNP shifts in ${f.city.name} pay $80 to $130 per hour without scheduled commitment. ${isExpensive(f.costTier) ? `With ${COST_PHRASES[f.costTier]}, local per-diem rates run at the top of that band and most providers stack shifts alongside a primary employer.` : `With ${COST_PHRASES[f.costTier]}, local per-diem rates sit lower in that band but go further against local expenses.`}`,
    'private-practice': (f) => `Private-practice PMHNP opportunities in ${f.city.name} include solo, group, and concierge models. Self-employed practitioners typically retain 65 to 75% of collected revenue after overhead, billing, and malpractice. ${isExpensive(f.costTier) ? `Local ${COST_PHRASES[f.costTier]} (index ${f.city.costOfLivingIndex}) pushes rent and cash-pay rates up together, which is why cash-pay and concierge models are more viable here.` : `Local ${COST_PHRASES[f.costTier]} (index ${f.city.costOfLivingIndex}) keeps overhead low but also caps cash-pay rates, so most practices here stay insurance-based.`}`,
    'senior': (f) => `Senior PMHNP roles in ${f.city.name} target providers with 7+ years of experience and typically include clinical leadership, supervisory authority over new graduates, and stipends for protocol development or quality improvement. ${f.topEmployers.length > 0 ? `Supervisory lines here concentrate at ${f.topEmployers.slice(0, 2).join(' and ')}.` : `In ${METRO_SCALE_PHRASES[f.populationTier]} these are usually the senior clinician seat at a single site rather than a system-wide post.`}`,
    'substance-abuse': (f) => `Substance-use-focused PMHNP positions in ${f.city.name} prescribe buprenorphine and naltrexone under a standard DEA registration, with no separate waiver required since 2023. ${f.shortage ? `MAT programs at FQHCs and addiction clinics in ${f.city.name} frequently qualify for NHSC and HRSA loan repayment, and the area's federal shortage designation is what makes most of them eligible.` : "MAT programs at FQHCs and addiction clinics frequently qualify for NHSC and HRSA loan repayment, with eligibility set by the individual site's HPSA score."}`,
    'va': (f) => {
        const scope = f.practiceAuthority === 'full'
            ? `${f.city.state} already grants full practice authority, so the local VA draw is the federal benefits package rather than scope.`
            : f.practiceAuthority
                ? `Federal practice authority generally supersedes state restrictions for VA-employed providers, a real difference in ${f.city.state}, where PMHNPs otherwise work under ${AUTHORITY_PHRASES[f.practiceAuthority]}.`
                : 'Federal practice authority generally supersedes state restrictions for VA-employed providers.';
        return `VA PMHNP positions in ${f.city.name} fall on the federal GS-12 to GS-14 pay scale with FEHB health coverage, the Thrift Savings Plan retirement match, and 26 days of paid leave annually. ${scope}`;
    },
    'veterans': (f) => `Veterans-focused PMHNP roles in ${f.city.name} span VA medical centers, community-based outpatient clinics, and Vet Centers. Roles emphasize PTSD, military sexual trauma, and traumatic brain injury alongside general psychiatric care. ${isDense(f.populationTier) ? 'A market this size usually hosts a full medical center, so the mix includes inpatient and specialty PTSD programs.' : 'A market this size is usually served by a community-based outpatient clinic, so the caseload skews outpatient and general.'}`,
};

/** Taxonomies with a dedicated lead. Exported so the differentiation test can
 *  sweep every one of them rather than a sample. */
export const TAXONOMY_LEAD_KEYS: readonly string[] = Object.keys(TAXONOMY_LEADS);

export function getTaxonomyLead(taxonomy: string, facts: CityNarrativeFacts): string | null {
    const fn = TAXONOMY_LEADS[taxonomy];
    if (!fn) return null;
    return fn(facts);
}

// ─── Taxonomy × city composite narrative ────────────────────────────────────

/**
 * @param taxonomyLabel Optional display label ("Inpatient", "VA") so the city
 *   body names the taxonomy instead of repeating verbatim across every
 *   category page for the same city. Optional because the preview and diff
 *   scripts call this with the slug alone.
 */
export function buildTaxonomyCityNarrative(
    facts: CityNarrativeFacts,
    taxonomy: string,
    totalJobs: number,
    taxonomyLabel?: string,
): string {
    const lead = getTaxonomyLead(taxonomy, facts);
    const cityCtx = buildCityNarrative(facts, totalJobs, taxonomyLabel);
    if (!lead) return cityCtx;
    return `${lead} ${cityCtx}`;
}
