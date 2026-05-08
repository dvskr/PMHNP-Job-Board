/**
 * State Narrative — deterministic per-(setting, state) content snippets.
 *
 * Mirrors the city-narrative pattern at lib/pseo/city-narrative.ts so every
 * indexable /jobs/{setting}/{state} page gets a substantively unique 2-3
 * sentence paragraph driven by structured facts. Two state pages with the
 * same (setting, state) pair will read the same; any other pair produces
 * measurably different prose because the fact mix differs.
 *
 * Goal: defeat Google's "Crawled — currently not indexed" thin-content flag
 * for pSEO state pages, where previously the only state-specific content
 * was stat interpolation (counts, COL, shortage count) wrapped in a shared
 * template. Two cats (e.g. remote/CA vs telehealth/CA) read 95% identical
 * to GoogleBot. This file fixes that.
 */
import {
    getStatePracticeAuthority,
    PracticeAuthority,
} from '@/lib/state-practice-authority';

// ─── Tiers ──────────────────────────────────────────────────────────────────

type COLTier = 'high-cost' | 'above-avg' | 'average' | 'below-avg' | 'low-cost';
type DemandTier = 'very-high' | 'high' | 'moderate' | 'low';

function colTier(col: number): COLTier {
    if (col >= 130) return 'high-cost';
    if (col >= 110) return 'above-avg';
    if (col >= 95) return 'average';
    if (col >= 85) return 'below-avg';
    return 'low-cost';
}

function demandTier(totalJobs: number): DemandTier {
    if (totalJobs >= 100) return 'very-high';
    if (totalJobs >= 30) return 'high';
    if (totalJobs >= 10) return 'moderate';
    return 'low';
}

// ─── Phrase fragments ───────────────────────────────────────────────────────

const COST_PHRASES: Record<COLTier, string> = {
    'high-cost': 'high cost of living relative to the national average',
    'above-avg': 'above-average cost of living',
    'average': 'cost of living near the national average',
    'below-avg': 'below-average cost of living',
    'low-cost': 'low cost of living relative to the national average',
};

const AUTHORITY_PHRASES: Record<PracticeAuthority, string> = {
    full: 'full practice authority — independent prescribing without physician oversight',
    reduced: 'reduced practice authority requiring a collaborative agreement with a physician',
    restricted: 'restricted practice authority requiring physician supervision',
};

const DEMAND_PHRASES: Record<DemandTier, string> = {
    'very-high': 'consistently high demand',
    'high': 'strong demand',
    'moderate': 'moderate demand',
    'low': 'a smaller pool of openings',
};

// ─── Setting-specific lead phrases ──────────────────────────────────────────
// One per SETTING_CONFIGS key. Each takes the state context so the lead is
// (slightly) state-aware where relevant (e.g. Compact-state remote roles).

interface StateCtx {
    stateName: string;
    stateCode: string;
    practiceAuthority: PracticeAuthority | null;
    avgCOL: number;
    shortageCityCount: number;
    totalJobs: number;
}

type SettingLeadFn = (ctx: StateCtx) => string;

const SETTING_LEADS: Record<string, SettingLeadFn> = {
    'remote': (c) => `Remote PMHNP positions covering patients in ${c.stateName} typically pay $130K–$200K+ and require active ${c.stateCode} state licensure plus a HIPAA-compliant home setup. Most postings welcome multi-state Compact licensure to broaden caseload reach.`,
    'telehealth': (c) => `Telehealth PMHNP roles serving the ${c.stateName} market combine asynchronous documentation with scheduled video visits. Employers require HIPAA-compliant equipment and at least a ${c.stateCode} license; multi-state Compact licensure expands earning potential.`,
    'inpatient': (c) => `Inpatient PMHNP positions across ${c.stateName} cover acute psychiatric units, consult-liaison services, and crisis stabilization. Shift differentials, weekend premiums, and on-call stipends are standard alongside base salary.`,
    'outpatient': (c) => `Outpatient PMHNP roles in ${c.stateName} span community mental health centers, group practices, and integrated primary-care settings. Caseloads typically run 12–18 patients per day with documentation time built in.`,
    'travel': (c) => `Travel PMHNP assignments in ${c.stateName} are usually 8–26 weeks with tax-free housing stipends, completion bonuses, and 20–50% premium pay over permanent equivalents. Most agencies handle multi-state licensure logistics.`,
    'addiction': (c) => `Addiction-focused PMHNP roles in ${c.stateName} require a DEA X-waiver for buprenorphine prescribing and frequently involve medication-assisted treatment (MAT) programs. NHSC loan repayment is broadly available for substance-use treatment positions.`,
    'contract': (c) => `Contract PMHNP positions in ${c.stateName} are typically 1099 engagements paying $90–$150 per hour. Contractors handle their own self-employment tax, malpractice insurance, and quarterly estimated payments — but retain higher take-home than equivalent W-2 roles.`,
    'correctional': (c) => `Correctional PMHNP roles in ${c.stateName} facilities often offer state-employee benefits, robust pension plans, and educational debt forgiveness through state-specific programs alongside NHSC eligibility.`,
};

// ─── Composite narrative ────────────────────────────────────────────────────

export function buildSettingStateNarrative(
    settingKey: string,
    stateName: string,
    stateCode: string,
    avgCOL: number,
    shortageCityCount: number,
    totalJobs: number,
): string {
    const auth = getStatePracticeAuthority(stateName);
    const ctx: StateCtx = {
        stateName,
        stateCode,
        practiceAuthority: auth?.authority ?? null,
        avgCOL,
        shortageCityCount,
        totalJobs,
    };

    const lead = SETTING_LEADS[settingKey]?.(ctx);
    const parts: string[] = [];
    if (lead) parts.push(lead);

    // Sentence 2: practice authority + COL anchor.
    const authPhrase = ctx.practiceAuthority
        ? AUTHORITY_PHRASES[ctx.practiceAuthority]
        : 'state-specific practice rules';
    parts.push(
        `${stateName} grants ${authPhrase}, and the state's ${COST_PHRASES[colTier(avgCOL)]} (index ${avgCOL}) directly shapes PMHNP compensation expectations.`,
    );

    // Sentence 3: demand + shortage signal — drives federal-loan framing.
    const demandPhrase = DEMAND_PHRASES[demandTier(totalJobs)];
    if (shortageCityCount > 0) {
        parts.push(
            `${shortageCityCount} of the state's top metros carry federal Mental Health Professional Shortage Area designation, so positions in those areas typically qualify for NHSC Loan Repayment. The current ${totalJobs} active postings reflect ${demandPhrase} for psychiatric nurse practitioners across ${stateName}.`,
        );
    } else {
        parts.push(
            `Top metros in ${stateName} are not currently federally designated mental health shortage areas, but regional psychiatric demand and reimbursement structure shape compensation. The ${totalJobs} active postings reflect ${demandPhrase} for PMHNPs in the state.`,
        );
    }

    return parts.join(' ');
}
