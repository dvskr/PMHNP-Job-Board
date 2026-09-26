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
    full: 'full practice authority with independent prescribing and no physician oversight',
    reduced: 'reduced practice authority requiring a collaborative agreement with a physician',
    restricted: 'restricted practice authority requiring physician supervision',
};

const DEMAND_PHRASES: Record<DemandTier, string> = {
    'very-high': 'consistently high demand',
    'high': 'strong demand',
    'moderate': 'moderate demand',
    'low': 'a smaller pool of openings',
};

// ─── NLC (Nurse Licensure Compact) membership ───────────────────────────────
// The NLC multistate license covers RN and LPN/VN practice ONLY. It does NOT
// carry APRN practice: the APRN Compact is a separate agreement that has not
// reached implementation, so a PMHNP needs an APRN license in every state
// whose residents they treat. Copy here used to say the opposite, which the
// site's own state license posts contradicted.
// As of 2026-05 the following are NOT compact members, so even the RN license
// has to be issued locally. Source: NCSBN compact page. Update when
// membership shifts.
const NLC_NON_MEMBER_STATES: ReadonlySet<string> = new Set([
    'California', 'Connecticut', 'Hawaii', 'Illinois', 'Massachusetts',
    'Michigan', 'Minnesota', 'Nevada', 'New York', 'Oregon',
    'Rhode Island', 'Washington', 'District of Columbia',
]);

function isNlcMember(stateName: string): boolean {
    return !NLC_NON_MEMBER_STATES.has(stateName);
}

// ─── Setting-specific lead phrases ──────────────────────────────────────────
// One per SETTING_CONFIGS key. Each takes the state context so the lead is
// (slightly) state-aware where relevant (e.g. Compact-state remote roles).
//
// No lead publishes a dollar figure. The ranges that used to sit here were
// hand-written, identical for Wyoming and California, and contradicted the
// tier-gated median the salary guide computes from live postings one click
// away. Pay on these pages comes from the listings and the aggregate stat,
// never from prose.

export interface StateCtx {
    stateName: string;
    stateCode: string;
    practiceAuthority: PracticeAuthority | null;
    avgCOL: number;
    shortageCityCount: number;
    totalJobs: number;
    /** Employers with the most open postings in this state, largest first. */
    topEmployers: string[];
    /** Gated top cities for this setting in this state, largest first. */
    topCities: string[];
}

/** "A", "A and B", "A, B, and C" — Oxford comma, matching the city narrative. */
function joinNames(names: string[]): string {
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

type SettingLeadFn = (ctx: StateCtx) => string;

const SETTING_LEADS: Record<string, SettingLeadFn> = {
    'remote': (c) => `Remote PMHNP positions covering patients in ${c.stateName} require a HIPAA-compliant home setup plus an active ${c.stateCode} APRN license: a multistate license issued under the Nurse Licensure Compact covers RN practice only, and the separate APRN Compact has not been implemented.${isNlcMember(c.stateName) ? '' : ` ${c.stateName} is also outside the Nurse Licensure Compact, so the underlying RN license has to be issued by ${c.stateCode} as well.`}`,
    'telehealth': (c) => `Telehealth PMHNP roles serving the ${c.stateName} market combine asynchronous documentation with scheduled video visits. Licensure follows the patient, so employers require HIPAA-compliant equipment and an active ${c.stateCode} APRN license; a Nurse Licensure Compact multistate license covers RN practice, not APRN practice.${isNlcMember(c.stateName) ? '' : ` ${c.stateName} is not a Compact member either, so the RN license must also be a ${c.stateCode} credential.`}`,
    'inpatient': (c) => `Inpatient PMHNP positions across ${c.stateName} cover acute psychiatric units, consult-liaison services, and crisis stabilization. ${c.topEmployers.length > 0 ? `The systems posting most of that acute work right now are ${joinNames(c.topEmployers.slice(0, 3))}.` : 'Acute beds in the state are concentrated in a small number of regional hospitals.'} Shift differentials, weekend premiums, and on-call stipends are standard alongside base salary.`,
    'outpatient': (c) => `Outpatient PMHNP roles in ${c.stateName} span community mental health centers, group practices, and integrated primary-care settings. Caseloads typically run 12 to 18 patients per day with documentation time built in. ${c.topCities.length > 0 ? `Most of the state's outpatient volume sits around ${joinNames(c.topCities.slice(0, 3))}.` : 'Outpatient volume is spread across the state rather than concentrated in one metro.'}`,
    'travel': (c) => `Travel PMHNP assignments in ${c.stateName} are usually 8 to 26 weeks with tax-free housing stipends and completion bonuses on top of the hourly rate. Most agencies handle the ${c.stateCode} APRN licensure logistics. ${c.shortageCityCount > 0 ? 'Assignments recur here because several of the largest metros in the state carry a federal mental health shortage designation.' : 'Assignments here usually follow turnover at the larger systems rather than a chronic shortfall.'}`,
    // The Consolidated Appropriations Act of 2023 removed the separate DEA
    // waiver for buprenorphine; standard DEA registration is now sufficient.
    'addiction': (c) => `Addiction-focused PMHNP roles in ${c.stateName} frequently sit inside medication-assisted treatment (MAT) programs. Buprenorphine prescribing needs only a standard DEA registration, with no separate waiver, though employers commonly expect MAT or ASAM training. NHSC loan repayment is broadly available for substance-use treatment positions at qualifying sites, and HRSA sets each cycle's award amounts and service terms.`,
    'contract': (c) => `Contract PMHNP positions in ${c.stateName} are typically defined-term W-2 engagements (90 days to 24 months) booked through staffing agencies, with agency-provided malpractice. Distinct from 1099 independent contracting, contract roles preserve employer payroll-tax handling and often include short-term health coverage, which is why the hourly rate and the salaried equivalent are not directly comparable.`,
    'correctional': (c) => `Correctional PMHNP roles in ${c.stateName} facilities often offer state-employee benefits, robust pension plans, and educational debt forgiveness through state-specific programs alongside NHSC eligibility. Caseloads lean toward intake screening and stabilization rather than long-term therapy.`,
    'full-time': (c) => `Full-time PMHNP positions in ${c.stateName} typically bundle employer-sponsored health insurance, 401(k) match, CME allowance, malpractice coverage, and 3 to 4 weeks of PTO into the base. ${c.topEmployers.length > 0 ? `The employers hiring on that basis here include ${joinNames(c.topEmployers.slice(0, 2))}.` : 'The employed model still accounts for most psychiatric openings in the state.'} Total-comp comparisons against contract or per-diem rates should net out the benefits self-funded clinicians have to cover themselves.`,
    'part-time': (c) => `Part-time PMHNP roles in ${c.stateName} run 16 to 32 scheduled hours weekly, with prorated benefits at larger health systems and none at smaller practices. The structure is popular for clinicians maintaining a private practice on the side or stepping down from a full caseload. ${c.topCities.length > 0 ? `Openings cluster around ${joinNames(c.topCities.slice(0, 2))}, where panel density supports a partial schedule.` : 'Openings are thin enough here that most clinicians pair one with telehealth coverage.'}`,
    'new-grad': (c) => `New-grad PMHNP positions in ${c.stateName} emphasize structured onboarding: formal preceptorship, gradual caseload ramp over 3 to 6 months, and protected supervision time. Community mental health centers and FQHCs broadly qualify for NHSC loan repayment, whose award amounts and service terms HRSA sets each cycle. ${c.practiceAuthority && c.practiceAuthority !== 'full' ? `${c.stateName} places PMHNPs under ${AUTHORITY_PHRASES[c.practiceAuthority]}, so a first role also has to supply that physician relationship.` : `${c.stateName} grants full practice authority, so a first role is chosen on supervision quality rather than on who can legally sign.`}`,
    '1099': (c) => `Independent-contractor (1099) PMHNP roles in ${c.stateName} carry no benefits and no employer-paid malpractice. Clinicians self-fund quarterly estimated taxes, occurrence-based malpractice, and any LLC or PLLC structure; net take-home depends heavily on those offsets and ${c.stateCode} self-employment tax exposure, so the hourly premium over a salaried role is not all margin.`,
    'behavioral-health': (c) => `Integrated behavioral health PMHNP roles in ${c.stateName} embed psychiatric NPs inside primary-care teams, FQHCs, and school-based clinics, typically 8 to 12 brief consults per day rather than full 30 to 60 minute sessions. Many sites qualify for NHSC loan repayment under value-based contracts that prioritize population mental-health outcomes. ${c.topEmployers.length > 0 ? `${joinNames(c.topEmployers.slice(0, 2))} carry most of the integrated caseload here.` : 'Integrated roles here sit inside primary-care groups rather than standalone behavioral health clinics.'}`,
};

// ─── Composite narrative ────────────────────────────────────────────────────

/**
 * Facts the caller has already fetched for the page. topEmployers and
 * topCities were previously computed, rendered in the sidebar, and then not
 * handed to the narrative, which is why 51 state pages shared a lead that
 * varied only by state name.
 */
export interface SettingStateNarrativeInput {
    settingKey: string;
    stateName: string;
    stateCode: string;
    avgCOL: number;
    shortageCityCount: number;
    totalJobs: number;
    topEmployers?: string[];
    topCities?: string[];
}

export function buildSettingStateNarrative(input: SettingStateNarrativeInput): string {
    const {
        settingKey,
        stateName,
        stateCode,
        avgCOL,
        shortageCityCount,
        totalJobs,
    } = input;
    const auth = getStatePracticeAuthority(stateName);
    const ctx: StateCtx = {
        stateName,
        stateCode,
        practiceAuthority: auth?.authority ?? null,
        avgCOL,
        shortageCityCount,
        totalJobs,
        topEmployers: input.topEmployers ?? [],
        topCities: input.topCities ?? [],
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

// ─── Setting x state FAQ ────────────────────────────────────────────────────

/**
 * Every /jobs/{setting}/{state} page used to render the NATIONAL category FAQ
 * with the state's count substituted, so 51 pages published "There are
 * currently N remote PMHNP job openings" with no state named: an answer
 * engine reading any one of them gets a national figure that is wrong, and
 * the FAQPage JSON-LD on all 51 was identical but for the number.
 *
 * These questions name the state, and every answer is derived from a fact
 * already on the page. No pay figure is stated: the page's own aggregate and
 * the state salary guide own that number.
 */
export interface SettingStateFaqInput {
    settingLabel: string;
    stateName: string;
    stateCode: string;
    totalJobs: number;
    /** Aggregate advertised salary in thousands; 0 when the engine has none. */
    avgSalary: number;
    topEmployers: string[];
    topCities: string[];
    shortageCityCount: number;
}

export interface SettingStateFaq {
    question: string;
    answer: string;
}

export function buildSettingStateFaqs(input: SettingStateFaqInput): SettingStateFaq[] {
    const {
        settingLabel, stateName, stateCode, totalJobs,
        avgSalary, topEmployers, topCities, shortageCityCount,
    } = input;
    const role = settingLabel.toLowerCase();
    const auth = getStatePracticeAuthority(stateName);
    const authPhrase = auth ? AUTHORITY_PHRASES[auth.authority] : 'state-specific practice rules';
    const plural = totalJobs === 1 ? 'position' : 'positions';

    return [
        {
            question: `How many ${role} PMHNP jobs are open in ${stateName}?`,
            answer: `This page lists ${totalJobs} ${role} PMHNP ${plural} in ${stateName} right now, refreshed as employers post and roles close.${topCities.length > 0 ? ` The largest concentrations are around ${joinNames(topCities.slice(0, 3))}.` : ''}`,
        },
        {
            question: `Do PMHNPs have full practice authority in ${stateName}?`,
            answer: `${stateName} grants ${authPhrase}. That applies to ${role} roles the same as to any other setting, and it is the single biggest difference between practicing here and in a neighboring state.`,
        },
        {
            question: `Which employers hire ${role} PMHNPs in ${stateName}?`,
            answer: topEmployers.length > 0
                ? `The employers with the most ${role} PMHNP postings in ${stateName} on this page are ${joinNames(topEmployers.slice(0, 5))}. The list moves with hiring, so it reflects who is actively recruiting rather than who is largest.`
                : `Openings in ${stateName} currently come from a mix of regional systems, group practices, and staffing agencies rather than one dominant employer.`,
        },
        {
            question: `What do ${role} PMHNP jobs in ${stateName} pay?`,
            answer: avgSalary > 0
                ? `Across the ${role} listings on this page, the advertised pay averages about $${avgSalary}K a year in ${stateName}. Individual postings show their own range wherever the employer discloses one, and the ${stateName} salary guide breaks the same data down by setting.`
                : `Too few ${role} employers in ${stateName} disclose a range for an average to mean anything, so this page does not publish one. Each listing shows its advertised pay when the employer includes it, and the ${stateName} salary guide reports a median once enough postings carry figures.`,
        },
        {
            question: `Do ${role} PMHNP roles in ${stateName} qualify for federal loan repayment?`,
            answer: shortageCityCount > 0
                ? `${shortageCityCount} of the top ${stateName} metros on this page carry a federal Mental Health Professional Shortage Area designation, so roles based there are commonly NHSC eligible. Eligibility turns on the individual site's HPSA score, and HRSA sets each cycle's award amounts and service terms.`
                : `The top ${stateName} metros on this page are not currently federally designated shortage areas, so eligibility turns on the individual site's HPSA score rather than the city. HRSA sets each cycle's award amounts and service terms.`,
        },
        {
            question: `What licenses do I need for ${role} PMHNP work in ${stateName}?`,
            answer: `You need PMHNP national certification, an active ${stateCode} RN license and ${stateCode} APRN license, and DEA registration for controlled substances. A Nurse Licensure Compact multistate license covers RN practice, not APRN practice, so ${stateName} APRN licensure is required even if you hold a compact RN license elsewhere.`,
        },
    ];
}
