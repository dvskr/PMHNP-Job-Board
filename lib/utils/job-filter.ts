
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

export function isRelevantJob(title: string = '', description: string = ''): boolean {
    const combinedText = `${title} ${description}`.toLowerCase();
    const titleLower = title.toLowerCase().trim();

    // 1. MUST have a Positive Keyword in Title OR Description
    let hasPositive = POSITIVE_KEYWORDS.some(kw => combinedText.includes(kw));

    // Supplement with combination logic for flexible titles (common in federal roles)
    // STRICT: Title MUST mention NP/APRN, and mental health context must be present
    if (!hasPositive) {
        const hasMentalHealthContext = combinedText.includes('mental health') ||
            combinedText.includes('psychiatric') ||
            combinedText.includes('behavioral health') ||
            combinedText.includes('psychiatry');

        const titleHasNP = titleLower.includes('nurse practitioner') ||
            titleLower.includes(' np') ||
            titleLower.includes('aprn') ||
            titleLower.includes('arnp');

        // Only allow combination match if TITLE has NP context
        if (hasMentalHealthContext && titleHasNP) {
            hasPositive = true;
        } else if (combinedText.includes('pmhnp')) {
            // Always allow if pmhnp appears anywhere
            hasPositive = true;
        }
    }

    if (!hasPositive) {
        return false;
    }

    // 2. GENERIC TITLE CHECK: If the title is just "Nurse Practitioner" or similar generic title,
    //    demand that the TITLE ITSELF has psychiatric/mental health context.
    //    Description-only context is too weak (many non-psych NP jobs at mental health orgs).
    const isGenericTitle = GENERIC_NP_TITLES.some(generic => {
        // Match exactly or with location/qualifier suffix
        // e.g. "Nurse Practitioner", "Nurse Practitioner - Memphis, TN", "Nurse Practitioner (NP)"
        return titleLower === generic ||
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
            titleLower.startsWith(generic + ' full');
    });

    if (isGenericTitle) {
        // For generic titles, the TITLE must contain psychiatric/mental health keywords
        const titleHasPsych = titleLower.includes('psych') ||
            titleLower.includes('mental health') ||
            titleLower.includes('behavioral health') ||
            titleLower.includes('pmhnp');

        if (!titleHasPsych) {
            return false;
        }
    }

    // 3. Strong Filter on TITLE for wrong roles
    // Exception: If title itself contains a positive PMHNP keyword, trust it
    const titleHasPositive = POSITIVE_KEYWORDS.some(kw => titleLower.includes(kw));
    if (titleHasPositive) {
        return true;
    }

    const isWrongRole = NEGATIVE_KEYWORDS.some(neg => {
        if (!titleLower.includes(neg)) return false;

        // Exception: Allow "psychiatrist" in title if it's a dual-role or collaborative post
        if (neg === 'psychiatrist') {
            const hasPMHNPIndicator = [
                'pmhnp',
                'nurse practitioner',
                'np-bc',
                'aprn',
                'arnp',
                'psych np'
            ].some(indicator => combinedText.includes(indicator));

            return !hasPMHNPIndicator;
        }

        return true;
    });

    if (isWrongRole) {
        return false;
    }

    return true;
}
