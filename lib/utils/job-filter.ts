
/**
 * Strict Job Filter for PMHNP Job Board
 * 
 * Criteria:
 * 1. MUST contain at least one "Positive Keyword" (PMHNP specific).
 * 2. MUST NOT contain "Negative Keywords" (Physician, Social Worker, etc.) UNLESS
 *    invalidated by a Positive Keyword.
 * 3. Generic "Nurse Practitioner" titles MUST have psychiatric/mental health context
 *    in BOTH the title AND context to pass.
 */

const POSITIVE_KEYWORDS = [
    'pmhnp',
    'psychiatric nurse practitioner',
    'psych nurse practitioner',
    'mental health nurse practitioner',
    'psychiatric mental health nurse practitioner',
    'psychiatric-mental health nurse practitioner',
    'psychiatric aprn',
    'psychiatric prescriber',
    'behavioral health nurse practitioner',
    'behavioral health np',
    'psych np',
    'mental health np',
    'psychiatric np',
    'pmhnp-bc',
    'fpmhnp',
    'pmnhp', // Common misspelling of PMHNP
    'app - psychiatry',
    'advanced practice provider - psychiatry',
    'nurse practitioner - psychiatry',
    'nurse practitioner - mental health',
    'nurse practitioner - behavioral health',
    'np - psychiatry',
    'np - mental health',
    'nurse practitioner psychiatry',
    'nurse practitioner mental health',
    'nurse practitioner behavioral health',
    'np psychiatry',
    'np mental health',
    'np behavioral health',
    // Headway/Jooble title variants (previously rejected by normalizer)
    'licensed psychiatric np',
    'licensed psychiatric nurse practitioner',
];

const NEGATIVE_KEYWORDS = [
    // Wrong provider type
    'physician',
    'medical doctor',
    ' m.d.',
    ' d.o.',
    'social worker',
    'therapist',
    'counselor',
    'psychiatrist',
    'practical nurse',
    ' lpn',
    ' lvn',
    ' cna',
    'medical assistant',
    'verify insurance',
    'receptionist',
    'scheduler',
    'driver',
    'dietitian',
    'nutritionist',
    'occupational therapist',
    'physical therapist',
    'speech therapist',
    'primary care',
    // NOTE: 'fnp' and 'family nurse practitioner' REMOVED — many dual-certified PMHNP/FNP postings exist
    'home based',
    'community care clinic',
    'emergency medicine',
    'acute care',
    'cardiology',
    'dermatology',
    'surgical',
    'orthopedic',
    'urology',
    'occupational health',
    // Non-provider roles
    'registered nurse',
    ' rn ',
    ' rn-',
    '-rn ',
    'lecturer',
    'instructor',
    'technician',
    // NOTE: 'coordinator' narrowed — 'scheduling coordinator', 'intake coordinator' etc still blocked
    'scheduling coordinator',
    'intake coordinator',
    'referral coordinator',
    'case manager',
    'program director',
    // NOTE: 'manager' narrowed — clinical roles like 'Clinical Manager - PMHNP' now allowed
    'office manager',
    'facility manager',
    'practice manager',
    // NOTE: 'associate' REMOVED — blocks legitimate roles like 'Associate Clinical Director - PMHNP'
    // NOTE: 'assistant' REMOVED — blocks dual-role 'Physician Assistant / PMHNP' postings
    'lcsw',
    'lmft',
    'licsw',
    'lpc',
    'phd',
    'psy d',
    'psychologist',
    'medical director',
    // NOTE: 'director of' narrowed — 'Director of Psychiatric Services' (with NP req) now allowed
    'director of nursing',
    'director of operations',
    'director of finance',
    // NOTE: 'graduate' REMOVED — blocks 'New Graduate PMHNP' positions
    // NOTE: 'child adolescent' REMOVED — blocks 'Child & Adolescent PMHNP' subspecialty
    // NOTE: 'outpatient position' REMOVED — blocks 'Outpatient PMHNP Position'
    // Gap closing: titles leaking from adzuna, jooble, lever, etc.
    'chiropractor',
    'hospitalist',
    'physician assistant',
    'pa-c',
    ' pa ',
    'locum tenens psychiatrist',
    'clinical nurse specialist',
    'medical front office',
    'talent community',
    ' icu ',
    'anesthesia',
    'pain management',
    'advanced practice clinician',
    // NOTE: 'family medicine' REMOVED — some PMHNP roles coexist with family medicine depts
    'nocturnist',
    'pediatric icu',
    'collaborating psychiatrist',
    // Gap closing round 3: from Feb 2026 audit of leaked jobs
    'neurologist',
    'interim cfo',
    'cfo',
    'building automation',
    'project sales',
    'recruiter',
    'recruitment',
    'patient acquisition',
    'talent acquisition',
    'director of growth',
    'patient access',
    'psychometrist',
    'mental health coordinator',
    'epileptologist',
    'business development',
    'bookings specialist',
    'medical science liaison',
    'lmsw',
    'lcpc',
    'lgpc',
    'prospect application',
    'pediatric nurse practitioner',
    'pediatric np',
    'pediatrics nurse practitioner',
    'women\'s health nurse practitioner',
    'women\'s health np',
    'certified nurse midwife',
    'nurse midwife',
    'midwife',
    'substance abuse nurse practitioner',
    'addiction medicine nurse practitioner',
    'travel nurse practitioner',
    'outpatient rn',
    'inpatient rn',
    'skilled nursing',
    'walk-in clinic',
    'urgent care',
    'oncology',
    'endocrinology',
    'gastroenterology',
    'nephrology',
    'pulmonology',
    'rheumatology',
    'hematology',
    'neurology',
    'bariatric',
    'neonatal',
    'labor and delivery',
    ' pace ',
    'wound care',
    'palliative',
    // NOTE: 'hospice' REMOVED — psychiatric hospice roles exist
    'nursing home',
    'long term care',
    'long-term care',
    'home health',
    'infusion',
    'dialysis',
    'transplant',
    // NOTE: 'float' REMOVED — 'Float PMHNP' is a common staffing model
    'medical np',
    'medical pa',
    'centralized nurse practioner', // Typo in Firsthand posting
];

/** Titles that are so generic they need STRONG psychiatric context in both title and description */
const GENERIC_NP_TITLES = [
    'nurse practitioner',
    'advanced practice provider',
    'advanced practice nurse',
    'advanced practice professional',
    'app',
    'apn',
    'inpatient app',
    'outpatient app',
    'prn nurse practitioner',
    'part time nurse practitioner',
    'part-time nurse practitioner',
    'weekend nurse practitioner',
    'clinical nurse practitioner',
    'pnp',
    'lpnp',
];

/**
 * Reasons a job can be rejected at the relevance gate.
 *
 * `relevance_filter` is kept as a catch-all for backward compat — new
 * code paths emit one of the more specific values so rejected_jobs
 * audit becomes actionable. See lib/ingestion-service.ts for the
 * caller that writes these strings.
 */
export type RelevanceReason =
    | 'pass'
    | 'relevance_no_keyword'           // No positive keyword AND no Tier-2/3 match
    | 'relevance_generic_title'         // Tier passed but title is generic + no psych context in title itself
    | 'relevance_wrong_role';           // Negative-keyword match (physician, social worker, etc.) without dual-role override

export interface RelevanceResult {
    passes: boolean;
    reason: RelevanceReason;
}

/**
 * Mental-health context terms — checked in title and description for
 * Tier 2 (NP-in-title + psych-context) and the generic-title guard.
 *
 * Extended 2026-05-05 to cover substance-abuse / addiction / MAT
 * vocabulary — these were missed before, causing roles at recovery
 * centers and substance-abuse clinics to be rejected.
 */
const MENTAL_HEALTH_CONTEXT_TERMS = [
    'mental health',
    'psychiatric',
    'behavioral health',
    'psychiatry',
    'addiction',
    'substance use',
    'substance abuse',
    'mat program',
    'medication-assisted treatment',
    'medication assisted treatment',
    'recovery center',
    'dual diagnosis',
    'suboxone',
    'buprenorphine',
];

/**
 * Specialties that, when they DEFINE the role in the TITLE, mean the posting is
 * NOT psychiatric — unless a STRONG psych signal rescues it (psych in the title,
 * a positive PMHNP keyword, a psych employer, or psych-specific description
 * terms). This closes the biggest leak: primary-care / hospice NP JDs (One
 * Medical, Ennoble Care) that merely list "behavioral health" once among many
 * services tripped the loose Tier-2 mental-health-context check and passed.
 */
export const OFF_SPECIALTY_TITLE_MARKERS = [
    'family nurse practitioner', 'family np', 'fnp',
    'primary care', 'internal medicine', 'family medicine', 'family practice',
    'hospice', 'palliative',
    "women's health", 'whnp', 'nurse midwife', 'midwife', 'ob/gyn', 'obgyn',
    'urgent care', 'walk-in clinic',
    'dermatology', 'aesthetic', 'med spa', 'medspa',
    'wound care', 'occupational health',
    'dialysis', 'nephrology', 'oncology', 'hematology', 'cardiology',
    'gastroenterology', 'endocrinology', 'pulmonology', 'rheumatology',
    'orthopedic', 'urology', 'neonatal', 'labor and delivery',
    'pediatric nurse practitioner', 'pediatric np', 'pediatrics nurse practitioner',
    'geriatric', 'geriatrics', 'gerontology',
    // Curly-apostrophe variant — aggregator titles often use U+2019, which the
    // straight-quote "women's health" above misses.
    'women’s health',
];

/**
 * Non-provider / non-NP roles that are not PMHNP postings even when the JD
 * mentions psychiatry (e.g. a recruiter sourcing PMHNPs, a psychometrist doing
 * testing). Excluded unless the title actually carries an NP/PA credential.
 */
export const NON_PROVIDER_TITLE_MARKERS = [
    'epileptologist', 'recruitment', 'recruiter', 'patient acquisition',
    'talent acquisition', 'director of growth', 'psychometrist',
    'mental health coordinator', 'patient access', 'sales representative',
    'account executive', 'business development',
];

/**
 * Psych terms specific enough that their presence means the role really is
 * psychiatric — vs a primary-care JD that lists "behavioral health" once. These
 * RESCUE off-specialty / generic titles where the loose MENTAL_HEALTH_CONTEXT_TERMS
 * (which includes a bare "behavioral health"/"mental health" mention) must not.
 */
const STRONG_PSYCH_DESC_TERMS = [
    'psychiatric', 'psychiatry', 'pmhnp', 'telepsychiatry', 'telepsych',
    'psychotropic', 'psychotherapy', 'mental illness', 'bipolar', 'schizophren',
    // Addiction / SUD is in-scope for this board, and these terms are specific
    // enough that primary care won't carry them — so they rescue an off-specialty
    // or generic title (e.g. "Family NP — Telehealth SUD", "NP/PA (OTP)").
    'substance use disorder', 'opioid use disorder', 'alcohol use disorder',
    'suboxone', 'buprenorphine', 'methadone', 'opioid treatment',
    'medication-assisted treatment', 'medication assisted treatment',
    'addiction medicine', ' otp ',
];

/**
 * Employer name patterns that strongly suggest a psych-focused org.
 * Used as an additional Tier 2.5 signal — a generic NP title at
 * "Senior PsychCare" or "Kanza Mental Health" should pass even
 * though title alone lacks psych context.
 */
const PSYCH_EMPLOYER_PATTERNS = [
    'psych',          // PsychCare, Psychiatric, Psychotherapy, etc.
    'mental health',
    'behavioral health',
    'behavioral',     // Behavioral Center / Behavioral Wellness
    'recovery',       // Recovery centers, addiction
    'addiction',
    'substance',
    'counseling',     // Counseling & Wellness centers
];

/**
 * Well-known psychiatric / mental-health employers whose NAMES carry no psych
 * keyword, so PSYCH_EMPLOYER_PATTERNS misses them. They post real PMHNP roles
 * (often generic "Prescribing NP or PA" contractor titles), so without this
 * allowlist the generic-title / off-specialty guards wrongly reject them.
 * Keep names specific enough not to collide with unrelated companies.
 */
export const PSYCH_EMPLOYER_ALLOWLIST = [
    'lyra health',
    'talkiatry',
    'brightside health',
    'sondermind',
    'cerebral',
    'two chairs',
    'grow therapy',
];

/**
 * Title patterns indicating a dual-role posting (NP OR PA, NP/PA, etc.).
 * When a title is dual-role, the negative-keyword check skips
 * `physician`, `physician assistant`, `pa-c`, ` pa ` — those words are
 * structurally part of the dual-role offer, not a wrong-role signal.
 */
export const DUAL_ROLE_PATTERNS = [
    'nurse practitioner or physician assistant',
    'physician assistant or nurse practitioner',
    'np or pa',
    'pa or np',
    'np / pa',
    'pa / np',
    'np /pa',
    'pa /np',
    'np/ pa',
    'pa/ np',
    'np/pa',
    'pa/np',
    'np-pa',
    'pa-np',
    'nurse practitioner / physician assistant',
    'physician assistant / nurse practitioner',
    'nurse practitioner /pa',
    'nurse practitioner / pa',
    'pa / nurse practitioner',
    'pa /nurse practitioner',
    'np / physician assistant',
    'physician assistant / np',
];

const DUAL_ROLE_NEGATIVE_KEYWORDS = new Set([
    'physician',
    'physician assistant',
    'pa-c',
    ' pa ',
    'medical pa',
]);

/**
 * Negative keywords that should be skipped when the title clearly
 * announces an advanced-practice nurse role. APRNs ARE registered
 * nurses with advanced training, so the bare 'registered nurse' /
 * ' rn ' negatives wrongly catch valid APRN titles.
 */
const APRN_NEGATIVE_OVERRIDES = new Set([
    'registered nurse',
    ' rn ',
    ' rn-',
    '-rn ',
]);

function isAprnTitle(titleLower: string): boolean {
    return (
        titleLower.includes('advanced practice registered nurse') ||
        titleLower.includes('aprn') ||
        titleLower.includes('arnp')
    );
}

function hasMentalHealthContext(combinedText: string): boolean {
    return MENTAL_HEALTH_CONTEXT_TERMS.some((term) => combinedText.includes(term));
}

function isPsychEmployer(employer: string | null | undefined): boolean {
    if (!employer) return false;
    const lower = employer.toLowerCase();
    return (
        PSYCH_EMPLOYER_PATTERNS.some((p) => lower.includes(p)) ||
        PSYCH_EMPLOYER_ALLOWLIST.some((p) => lower.includes(p))
    );
}

function isDualRoleTitle(titleLower: string): boolean {
    return DUAL_ROLE_PATTERNS.some((p) => titleLower.includes(p));
}

function hasOffSpecialtyTitle(titleLower: string): boolean {
    return OFF_SPECIALTY_TITLE_MARKERS.some((m) => titleLower.includes(m));
}

function titleHasPsychWord(titleLower: string): boolean {
    return ['psych', 'mental health', 'behavioral health', 'pmhnp', 'telepsych'].some((t) =>
        titleLower.includes(t),
    );
}

/**
 * Psych-specific description signal — stronger than a stray "behavioral health"
 * mention. True when either (a) a psych/addiction-specific term is present, or
 * (b) the loose mental-health vocabulary appears REPEATEDLY. A primary-care JD
 * lists "behavioral health" once among many services; a real psych JD (e.g.
 * Lyra Health) mentions mental-health terms throughout.
 */
const STRONG_PSYCH_CONTEXT_MIN_HITS = 3;
function hasStrongPsychContext(combinedText: string): boolean {
    if (STRONG_PSYCH_DESC_TERMS.some((t) => combinedText.includes(t))) return true;
    let hits = 0;
    for (const term of MENTAL_HEALTH_CONTEXT_TERMS) {
        let idx = combinedText.indexOf(term);
        while (idx !== -1) {
            hits += 1;
            if (hits >= STRONG_PSYCH_CONTEXT_MIN_HITS) return true;
            idx = combinedText.indexOf(term, idx + term.length);
        }
    }
    return false;
}

/**
 * Classify a job's relevance and return the reason. The boolean
 * `isRelevantJob` is preserved as a thin wrapper for legacy callers.
 *
 * @param title       Job title (raw from source).
 * @param description Job description (raw — HTML is fine, we just lowercase-substring).
 * @param employer    Employer name. Optional but improves Tier 2.5 detection.
 */
export function classifyRelevance(
    title: string = '',
    description: string = '',
    employer: string = '',
): RelevanceResult {
    const combinedText = `${title} ${description}`.toLowerCase();
    const titleLower = title.toLowerCase().trim();
    const employerLower = employer.toLowerCase();
    const dualRole = isDualRoleTitle(titleLower);
    const aprn = isAprnTitle(titleLower);

    // 1. MUST have a Positive Keyword in Title OR Description
    let hasPositive = POSITIVE_KEYWORDS.some((kw) => combinedText.includes(kw));

    if (!hasPositive) {
        const psychContext = hasMentalHealthContext(combinedText);
        // Word-boundary 'np' check so titles starting with NP/NP- match too.
        const titleHasNP =
            titleLower.includes('nurse practitioner') ||
            /\bnp\b/.test(titleLower) ||
            titleLower.includes('aprn') ||
            titleLower.includes('arnp');

        // Tier 2: NP-in-title + psych-context-anywhere
        if (psychContext && titleHasNP) {
            hasPositive = true;
        } else if (combinedText.includes('pmhnp')) {
            // Tier 3: catch-all PMHNP mention anywhere
            hasPositive = true;
        } else if (titleHasNP && isPsychEmployer(employer)) {
            // Tier 2.5: NP-in-title + psych-employer (covers cases where
            // title and description don't say psych but the employer
            // clearly is one — e.g. Senior PsychCare, Kanza Mental Health).
            hasPositive = true;
        }
    }

    if (!hasPositive) {
        return { passes: false, reason: 'relevance_no_keyword' };
    }

    const titleHasPositiveKeyword = POSITIVE_KEYWORDS.some((kw) => titleLower.includes(kw));

    // 1b. OFF-SPECIALTY VETO
    // A title that DEFINES another specialty (Family NP, primary care, hospice,
    // women's health, oncology, …) is a psychiatric posting ONLY if a STRONG
    // psych signal rescues it: psych in the title, a positive PMHNP keyword, a
    // psych employer, or psych-specific description terms. A primary-care /
    // hospice JD that merely lists "behavioral health" once does NOT qualify.
    if (hasOffSpecialtyTitle(titleLower) && !titleHasPositiveKeyword) {
        const rescued =
            titleHasPsychWord(titleLower) ||
            isPsychEmployer(employer) ||
            hasStrongPsychContext(combinedText);
        if (!rescued) {
            return { passes: false, reason: 'relevance_wrong_role' };
        }
    }

    // 2. GENERIC TITLE CHECK
    const isGenericTitle = GENERIC_NP_TITLES.some((generic) => {
        return (
            titleLower === generic ||
            titleLower.startsWith(generic + ' -') ||
            titleLower.startsWith(generic + ' –') ||
            titleLower.startsWith(generic + ' (') ||
            titleLower.startsWith(generic + ',') ||
            titleLower.startsWith(generic + ' $') ||
            titleLower.endsWith(' ' + generic) ||
            titleLower.startsWith(generic + ' sign') ||
            titleLower.startsWith(generic + ' travel') ||
            titleLower.startsWith(generic + ' prn') ||
            titleLower.startsWith(generic + ' weekend') ||
            titleLower.startsWith(generic + ' part') ||
            titleLower.startsWith(generic + ' full')
        );
    });

    // A bare dual-role post ("Nurse Practitioner or Physician Assistant") with
    // no specialty or psych word is just as generic — One Medical / Ennoble
    // emit these for primary-care / hospice roles. Treat them as generic so the
    // same psych-signal requirement applies.
    const isGenericDualRole =
        dualRole && !titleHasPsychWord(titleLower) && !hasOffSpecialtyTitle(titleLower) && !titleHasPositiveKeyword;

    // Generic SINGLE-role titles ("Nurse Practitioner") need psych in the title
    // or a psych employer — a description-only mention is too weak (it leaks
    // primary-care NPs whose JD lists psych among many services).
    if (isGenericTitle) {
        if (!titleHasPsychWord(titleLower) && !isPsychEmployer(employer)) {
            return { passes: false, reason: 'relevance_generic_title' };
        }
    } else if (isGenericDualRole) {
        // Bare dual-role "NP or PA" posts (One Medical, Ennoble): same psych
        // requirement, but ALSO accept a strong/addiction description signal —
        // the employer allowlist covers known psych orgs (Lyra), strong context
        // covers SUD / OTP roles, while primary-care/hospice still fall through.
        const rescued =
            titleHasPsychWord(titleLower) ||
            isPsychEmployer(employer) ||
            hasStrongPsychContext(combinedText);
        if (!rescued) {
            return { passes: false, reason: 'relevance_wrong_role' };
        }
    }

    // 3. Strong filter on TITLE for wrong roles.
    // Exception: title itself contains a positive PMHNP keyword → trust it.
    const titleHasPositive = POSITIVE_KEYWORDS.some((kw) => titleLower.includes(kw));
    if (titleHasPositive) {
        return { passes: true, reason: 'pass' };
    }

    const isWrongRole = NEGATIVE_KEYWORDS.some((neg) => {
        if (!titleLower.includes(neg)) return false;

        // Exception A: psychiatrist allowed if a PMHNP indicator is present
        // (collaborative-care or dual-role psychiatrist+PMHNP postings).
        if (neg === 'psychiatrist') {
            const hasPMHNPIndicator = [
                'pmhnp',
                'nurse practitioner',
                'np-bc',
                'aprn',
                'arnp',
                'psych np',
            ].some((indicator) => combinedText.includes(indicator));
            return !hasPMHNPIndicator;
        }

        // Exception B (NEW 2026-05-05): physician / PA negative keywords
        // are skipped for dual-role NP-or-PA postings. Adzuna in particular
        // emits many "Nurse Practitioner or Physician Assistant - Psychiatry"
        // titles that the old filter killed because of the bare 'physician' /
        // ' pa ' rules. Dual-role posts are exactly what we want to catch.
        if (dualRole && DUAL_ROLE_NEGATIVE_KEYWORDS.has(neg)) {
            return false;
        }

        // Exception C (NEW 2026-05-05): APRN titles legitimately contain
        // 'registered nurse' / ' rn ' as part of "Advanced Practice
        // Registered Nurse" — those negatives target staff RNs, not
        // advanced-practice nurses. Skip them when the title is APRN-marked.
        if (aprn && APRN_NEGATIVE_OVERRIDES.has(neg)) {
            return false;
        }

        return true;
    });

    if (isWrongRole) {
        return { passes: false, reason: 'relevance_wrong_role' };
    }

    return { passes: true, reason: 'pass' };
}

/** Boolean wrapper around classifyRelevance for legacy callers. */
export function isRelevantJob(title: string = '', description: string = ''): boolean {
    return classifyRelevance(title, description, '').passes;
}
