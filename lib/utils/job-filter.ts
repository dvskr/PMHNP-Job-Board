
/**
 * Strict Job Filter for PMHNP Job Board
 * 
 * Criteria:
 * 1. MUST contain at least one "Positive Keyword" (PMHNP specific).
 * 2. MUST NOT contain "Negative Keywords" (Physician, Social Worker, etc.) UNLESS
 *    invalidated by a Positive Keyword.
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
    'app - psychiatry',
    'advanced practice provider - psychiatry',
    'nurse practitioner - psychiatry',
    'nurse practitioner - mental health',
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
    'fnp',
    'family nurse practitioner',
    'family practice',
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
    // Gap Closing: Strict exclusions for non-provider roles
    'registered nurse',
    ' rn ',
    ' rn-',
    '-rn ',
    'lecturer',
    'instructor',
    'technician',
    'coordinator',
    'case manager',
    'program director',
    'manager',
    'associate',
    'assistant',
    'lcsw',
    'lmft',
    'licsw',
    'lpc',
    'phd',
    'psy d',
    'psychologist',
    'medical director',
    'director of',
    'graduate',
    'technician',
    'child adolescent', // ambiguous title, often therapist
    'outpatient position', // ambiguous
    // Gap closing round 2: titles leaking from adzuna, jooble, lever, etc.
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
    'family medicine',
    'nocturnist',
    'pediatric icu',
    'collaborating psychiatrist',
];

export function isRelevantJob(title: string = '', description: string = ''): boolean {
    const combinedText = `${title} ${description}`.toLowerCase();
    const titleLower = title.toLowerCase();

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
        // Description-only 'np' matches are too loose (e.g. "Hospitalist NP/PA" descriptions mentioning psychiatry)
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

    // 2. Strong Filter on TITLE for wrong roles
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

            // Only count as "Wrong Role" if it DOES NOT mention any NP indicators
            return !hasPMHNPIndicator;
        }

        return true;
    });

    if (isWrongRole) {
        return false;
    }

    return true;
}
