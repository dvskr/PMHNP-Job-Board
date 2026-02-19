/**
 * Deterministic Matcher — maps form field IDs/names/labels to profile values
 * without any AI. Fast, free, and reliable for the ~90% of fields that are obvious.
 */

import type { ScannedField } from './scanner';
import { log, warn } from '@/shared/logger';
import { getActiveFieldPatterns } from './profiles';
import type { IndustryProfileId } from './profiles';

// ─── Slim profile shape (only what the extension fills directly) ───

export interface AutofillProfile {
    firstName: string;
    lastName: string;
    fullName: string;       // composite: firstName + " " + lastName
    email: string;
    phone: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    addressLine1: string;
    addressLine2: string;
    location: string;       // composite: city + ", " + state
    linkedinUrl: string;
    websiteUrl: string;
    headline: string;

    // Credentials
    npiNumber: string;
    deaNumber: string;
    licenseType: string;
    licenseNumber: string;
    licenseState: string;
    certificationNumber: string;

    // Clinical
    primarySpecialty: string;

    // Education (most recent)
    schoolName: string;
    degreeType: string;
    fieldOfStudy: string;
    graduationDate: string;
    educationStartYear: string;
    educationEndYear: string;

    // Work (current/most recent)
    currentJobTitle: string;
    currentEmployer: string;
    currentEmployerCity: string;
    currentEmployerState: string;
    yearsExperience: string;
    workStartMonth: string;
    workStartYear: string;
    workEndMonth: string;
    workEndYear: string;
    currentlyWorkHere: string;

    // EEO
    workAuthorized: string;
    requiresSponsorship: string;
    veteranStatus: string;
    disabilityStatus: string;
    gender: string;
    raceEthnicity: string;

    // Preferences
    desiredSalary: string;
    availableDate: string;

    // Screening (yes/no)
    felonyConviction: string;
    licenseRevoked: string;
    backgroundCheck: string;
    drugScreen: string;

    // Documents
    resumeUrl: string;
}

// ─── Match result ───

export interface MatchResult {
    matched: MatchedField[];
    unmatched: UnmatchedField[];
}

export interface MatchedField {
    index: number;
    field: ScannedField;
    profileKey: string;
    value: string;
    interaction: 'text' | 'select' | 'radio' | 'checkbox' | 'dropdown' | 'date' | 'file';
}

export interface UnmatchedField {
    index: number;
    field: ScannedField;
}

// ─── Field patterns are now loaded from the profile registry ───
// See: src/content/profiles/ (core.ts, healthcare.ts, tech.ts)
// Patterns are resolved at match-time via getActiveFieldPatterns(industry).

// ─── Main matcher function ───

export function deterministicMatch(
    fields: ScannedField[],
    profile: AutofillProfile,
    industryProfile: IndustryProfileId = 'none',
): MatchResult {
    const matched: MatchedField[] = [];
    const unmatched: UnmatchedField[] = [];
    const usedOnceKeys = new Set<string>(); // Track experience/education keys to prevent duplicates

    // Resolve patterns from profile registry (cast string map values to profile keys)
    const patterns = getActiveFieldPatterns(industryProfile);
    const FIELD_MAP = patterns.fieldMap as [RegExp, keyof AutofillProfile][];
    const STRICT_FIELD_MAP = patterns.strictFieldMap as [RegExp, keyof AutofillProfile][];
    const DATA_AUTOMATION_MAP = patterns.dataAutomationMap as Record<string, keyof AutofillProfile>;
    const NAME_ATTR_MAP = patterns.exactNameMap as Record<string, keyof AutofillProfile>;

    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];

        // Skip file inputs — handled separately via FETCH_FILE
        if (field.type === 'file') {
            if (profile.resumeUrl) {
                const fieldHint = [
                    field.id,
                    field.name,
                    field.label,
                    field.placeholder,
                    field.attributes?.['aria-label'] || '',
                ].join(' ').toLowerCase();

                // Blocklist: do NOT upload resume to these specific non-resume file fields
                const isCoverLetter = /cover.?letter|covering.?letter/i.test(fieldHint);
                const isProfilePhoto = /profile.?photo|avatar|headshot|photo/i.test(fieldHint);
                const isAdditionalDoc = /additional.?doc|supporting.?doc|other.?doc/i.test(fieldHint);

                if (isCoverLetter || isProfilePhoto || isAdditionalDoc) {
                    // Known non-resume field — skip it
                    unmatched.push({ index: i, field });
                } else {
                    // Default: treat as resume upload
                    matched.push({
                        index: i,
                        field,
                        profileKey: 'resumeUrl',
                        value: '__FILE_UPLOAD__',
                        interaction: 'file',
                    });
                }
            } else {
                unmatched.push({ index: i, field });
            }
            continue;
        }



        // Skip textareas for deterministic matching — they're usually open-ended
        // (e.g. "Let the company know about your interest", cover letter, etc.)
        if (field.type === 'textarea') {
            unmatched.push({ index: i, field });
            continue;
        }

        // Build search strings
        const idNameStr = [field.id, field.name].join(' ');  // strict: only id + name
        const fullSearchStr = [                               // broad: includes all metadata
            field.id,
            field.name,
            field.label,
            field.placeholder,
            field.attributes['aria-label'] || '',
            field.attributes['data-automation-id'] || '',
        ].join(' ');

        // Step 0: Try exact name-attribute map first (highest priority)
        let profileKey: keyof AutofillProfile | null = null;
        if (field.name) {
            const nameKey = NAME_ATTR_MAP[field.name.toLowerCase()];
            if (nameKey) {
                profileKey = nameKey;
                log(`[PMHNP-Match] NAME_ATTR_MAP hit: name="${field.name}" → ${nameKey}`);
            }
        }

        // Step 0.5: Try data-automation-id exact map (Workday-specific)
        if (!profileKey) {
            const automationId = field.attributes['data-automation-id'];
            if (automationId) {
                const autoKey = DATA_AUTOMATION_MAP[automationId];
                if (autoKey) {
                    profileKey = autoKey;
                    log(`[PMHNP-Match] DATA_AUTOMATION_MAP hit: data-automation-id="${automationId}" → ${autoKey}`);
                }
            }
        }

        // Step 1: Try strict patterns (id/name only — avoids false positives)
        if (!profileKey) {
            for (const [pattern, key] of STRICT_FIELD_MAP) {
                if (pattern.test(idNameStr)) {
                    profileKey = key;
                    break;
                }
            }
        }

        // Step 2: Try broad patterns (id + name + label + placeholder)
        if (!profileKey) {
            for (const [pattern, key] of FIELD_MAP) {
                if (pattern.test(fullSearchStr)) {
                    profileKey = key;
                    break;
                }
            }
        }

        // ─── Deduplication for repeated sections ───
        // Profile stores only ONE work experience and ONE education entry.
        // Workday (and others) may show multiple sections (Work Experience 1, 2, Education 1, 2).
        // Only fill the FIRST matching section to avoid duplicates.
        const ONCE_ONLY_KEYS: Set<string> = new Set([
            'currentJobTitle', 'currentEmployer', 'currentEmployerCity', 'currentEmployerState',
            'workStartMonth', 'workStartYear', 'workEndMonth', 'workEndYear', 'currentlyWorkHere',
            'schoolName', 'degreeType', 'fieldOfStudy', 'graduationDate',
            'educationStartYear', 'educationEndYear',
        ]);

        if (profileKey && ONCE_ONLY_KEYS.has(profileKey) && usedOnceKeys.has(profileKey)) {
            log(`[PMHNP-Match] Skipping duplicate: [${i}] "${field.label?.substring(0, 30)}" key=${profileKey} (already filled in first section)`);
            unmatched.push({ index: i, field });
            continue;
        }

        if (profileKey && profile[profileKey]) {
            const value = String(profile[profileKey]);
            const interaction = inferInteraction(field);

            // For select/dropdown fields — we MUST verify the value exists in the options
            // before claiming it as matched. If we can't find a matching option, send to AI
            // (the AI can reason about which option best matches the profile data).
            if (interaction === 'select' || interaction === 'dropdown') {
                if (field.options.length > 0) {
                    log(`[PMHNP-Match] Select field [${i}] "${field.label.substring(0, 30)}" key=${profileKey} value="${value}" options=`, JSON.stringify(field.options));
                    const bestOption = findBestOption(field.options, value);
                    log(`[PMHNP-Match]   → bestOption="${bestOption}"`);
                    if (bestOption) {
                        matched.push({ index: i, field, profileKey, value: bestOption, interaction });
                        usedOnceKeys.add(profileKey);
                    } else {
                        // Value doesn't match any option — let AI handle it
                        log(`[PMHNP-Match]   → No matching option — sending to AI`);
                        unmatched.push({ index: i, field });
                    }
                } else {
                    // Select/dropdown with 0 options captured — likely lazy-loaded.
                    // Send to AI; it will see the options at fill-time or handle via custom dropdown.
                    // Still mark the key as used so duplicates (Education 2, etc.) don't double-fill
                    log(`[PMHNP-Match] Select field [${i}] "${field.label.substring(0, 30)}" has 0 options — sending to AI`);
                    if (ONCE_ONLY_KEYS.has(profileKey)) usedOnceKeys.add(profileKey);
                    unmatched.push({ index: i, field });
                }
            } else {
                matched.push({ index: i, field, profileKey, value, interaction });
                usedOnceKeys.add(profileKey);
            }
        } else {
            unmatched.push({ index: i, field });
        }
    }

    log(`[PMHNP-Match] Deterministic: ${matched.length} matched, ${unmatched.length} unmatched`);

    return { matched, unmatched };
}

// ─── Helpers ───

function inferInteraction(field: ScannedField): MatchedField['interaction'] {
    switch (field.type) {
        case 'select': return 'select';
        case 'radio': return 'radio';
        case 'checkbox': return 'checkbox';
        case 'custom-dropdown': return 'dropdown';
        case 'date': return 'date';
        case 'file': return 'file';
        default: return 'text';
    }
}

const STATE_ABBR: Record<string, string> = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
    KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
    MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
    OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
    DC: 'Washington DC',
};

// License type abbreviation aliases
const LICENSE_ALIASES: Record<string, string[]> = {
    'APRN': ['Nurse Practitioner', 'NP', 'APRN'],
    'NP': ['Nurse Practitioner', 'NP'],
    'PA': ['Physician Assistant', 'PA'],
    'MD': ['Doctor of Medicine', 'MD', 'Physician'],
    'DO': ['Doctor of Osteopathic Medicine', 'DO', 'Osteopathic'],
    'CRNA': ['Certified Registered Nurse Anesthetist', 'CRNA'],
    'DMD': ['Doctor of Dental Medicine', 'DMD'],
    'DDS': ['Doctor of Dental Surgery', 'DDS'],
    'DPM': ['Doctor of Podiatric Medicine', 'DPM'],
    'OD': ['Doctor of Optometry', 'OD'],
    'CAA': ['Certified Anesthesiologist Assistant', 'CAA'],
    'RN': ['Registered Nurse', 'RN'],
};

function findBestOption(options: string[], value: string): string | null {
    const lower = value.toLowerCase();
    // Filter out placeholder options
    const real = options.filter(o => !/^(select|choose|--|$)/i.test(o.trim()));

    // 1. Exact match (case-insensitive)
    const exact = real.find(o => o.toLowerCase() === lower);
    if (exact) return exact;

    // 2. License type alias expansion (APRN → Nurse Practitioner (NP), etc.)
    const aliases = LICENSE_ALIASES[value.toUpperCase()];
    if (aliases) {
        for (const alias of aliases) {
            const aliasLower = alias.toLowerCase();
            const aliasMatch = real.find(o =>
                o.toLowerCase().includes(aliasLower) ||
                aliasLower.includes(o.toLowerCase())
            );
            if (aliasMatch) return aliasMatch;
        }
    }

    // 3. State abbreviation expansion (TX → Texas, CA → California, etc.)
    if (lower.length === 2) {
        const expanded = STATE_ABBR[value.toUpperCase()];
        if (expanded) {
            const stateMatch = real.find(o =>
                o.toLowerCase() === expanded.toLowerCase() ||
                o.toLowerCase().includes(expanded.toLowerCase()) ||
                expanded.toLowerCase().includes(o.toLowerCase())
            );
            if (stateMatch) return stateMatch;
        }
    }

    // 4. Prefix match — option starts with value OR value starts with option
    const prefix = real.find(o => o.toLowerCase().startsWith(lower));
    if (prefix) return prefix;

    // 5. Scored substring match — pick the BEST match, not the first
    //    This prevents "Asian" from matching "Hispanic or Latino" when
    //    "Asian (Not Hispanic or Latino)" is available.
    {
        let bestScore = 0;
        let bestMatch: string | null = null;
        for (const o of real) {
            const oLower = o.toLowerCase();
            let score = 0;
            if (oLower.includes(lower)) {
                // Option contains the value — score by how much of the option is the value
                score = lower.length / oLower.length;
            } else if (lower.includes(oLower)) {
                // Value contains the option — score by how much of the value is the option
                score = oLower.length / lower.length;
            }
            if (score > bestScore) {
                bestScore = score;
                bestMatch = o;
            }
        }
        // Require at least 30% overlap to avoid false matches
        if (bestMatch && bestScore >= 0.3) return bestMatch;
    }

    // 6. For yes/no values
    if (['yes', 'true', '1'].includes(lower)) {
        const yesOption = real.find(o => /^yes/i.test(o));
        if (yesOption) return yesOption;
    }
    if (['no', 'false', '0'].includes(lower)) {
        const noOption = real.find(o => /^no/i.test(o));
        if (noOption) return noOption;
    }

    // 7. Word-overlap scoring — handles variations like
    //    value="I am a protected veteran" vs option="I am a veteran"
    const STOP = new Set(['i', 'a', 'am', 'an', 'the', 'to', 'of', 'or', 'and', 'in', 'for', 'my', 'do', 'self']);
    const valueWords = lower.split(/[\s-]+/).filter(w => w.length > 1 && !STOP.has(w));
    if (valueWords.length > 0) {
        let bestScore = 0;
        let bestMatch: string | null = null;
        for (const o of real) {
            const oWords = o.toLowerCase().split(/[\s-]+/).filter(w => w.length > 1 && !STOP.has(w));
            const overlap = valueWords.filter(vw => oWords.some(ow => ow === vw || ow.includes(vw) || vw.includes(ow))).length;
            const score = overlap / Math.max(valueWords.length, 1);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = o;
            }
        }
        if (bestMatch && bestScore >= 0.5) return bestMatch;
    }

    return null;
}

// ─── EEO value maps (DB snake_case → human-readable for ATS matching) ───

const VETERAN_MAP: Record<string, string> = {
    protected_veteran: 'I am a protected veteran',
    not_a_veteran: 'I am not a veteran',
    decline: 'I decline to self-identify',
};

const DISABILITY_MAP: Record<string, string> = {
    yes: 'Yes, I have a disability',
    no: 'No, I do not have a disability',
    no_disability: 'No, I do not have a disability',
    decline: 'I decline to self-identify',
};

const GENDER_MAP: Record<string, string> = {
    male: 'Male',
    female: 'Female',
    non_binary: 'Non-binary',
    decline: 'I decline to self-identify',
};

const RACE_MAP: Record<string, string> = {
    asian: 'Asian',
    white: 'White',
    black_or_african_american: 'Black or African American',
    hispanic_or_latino: 'Hispanic or Latino',
    american_indian_or_alaska_native: 'American Indian or Alaska Native',
    native_hawaiian_or_other_pacific_islander: 'Native Hawaiian or Other Pacific Islander',
    two_or_more_races: 'Two or More Races',
    decline: 'Decline to self-identify',
};

function humanizeEeo(value: string | null | undefined, map: Record<string, string>): string {
    if (!value) return '';
    return map[value] || value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Profile converter (full ProfileData → slim AutofillProfile) ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toAutofillProfile(full: any): AutofillProfile {
    const p = full?.personal || full || {};
    const edu = (full?.education || [])[0] || {};
    const work = (full?.workExperience || [])[0] || {};
    const eeo = full?.eeo || {};
    const prefs = full?.preferences || {};
    const meta = full?.meta || {};
    const creds = full?.credentials || {};
    const screening = full?.screeningAnswers || {};
    const allScreening = { ...(screening.background || {}), ...(screening.logistics || {}) };
    // Debug: log EEO values for troubleshooting
    log('[PMHNP-Match] EEO raw:', JSON.stringify(eeo));

    const firstName = p.firstName || '';
    const lastName = p.lastName || '';
    const city = p.address?.city || p.city || '';
    const state = p.address?.state || p.state || '';

    const result: AutofillProfile = {
        firstName,
        lastName,
        fullName: [firstName, lastName].filter(Boolean).join(' '),
        email: p.email || '',
        phone: p.phone || '',
        city,
        state,
        zip: p.address?.zip || p.zip || '',
        country: p.address?.country || p.country || '',
        addressLine1: p.address?.line1 || p.addressLine1 || '',
        addressLine2: p.address?.line2 || p.addressLine2 || '',
        location: [city, state].filter(Boolean).join(', '),
        linkedinUrl: p.linkedinUrl || '',
        websiteUrl: p.websiteUrl || '',
        headline: p.headline || '',

        npiNumber: creds.npiNumber || '',
        deaNumber: creds.deaNumber || '',
        licenseType: (creds.licenses || [])[0]?.licenseType || p.licenseType || '',
        licenseNumber: (creds.licenses || [])[0]?.licenseNumber || '',
        licenseState: (creds.licenses || [])[0]?.licenseState || '',
        certificationNumber: (creds.certifications || [])[0]?.certificationNumber || '',

        primarySpecialty: (p.specialties || [])[0] || p.primarySpecialty || '',

        schoolName: edu.schoolName || '',
        degreeType: edu.degreeType || '',
        fieldOfStudy: edu.fieldOfStudy || '',
        graduationDate: edu.graduationDate || '',
        educationStartYear: edu.startDate ? new Date(edu.startDate).getFullYear().toString() : '',
        educationEndYear: edu.graduationDate ? new Date(edu.graduationDate).getFullYear().toString() : '',

        currentJobTitle: work.jobTitle || '',
        currentEmployer: work.employerName || '',
        currentEmployerCity: work.employerCity || '',
        currentEmployerState: work.employerState || '',
        yearsExperience: p.yearsExperience ? String(p.yearsExperience) : '',
        workStartMonth: work.startDate ? (new Date(work.startDate).getMonth() + 1).toString() : '',
        workStartYear: work.startDate ? new Date(work.startDate).getFullYear().toString() : '',
        workEndMonth: work.isCurrent ? '' : (work.endDate ? (new Date(work.endDate).getMonth() + 1).toString() : ''),
        workEndYear: work.isCurrent ? '' : (work.endDate ? new Date(work.endDate).getFullYear().toString() : ''),
        currentlyWorkHere: work.isCurrent ? 'true' : '',

        workAuthorized: eeo.workAuthorized != null ? (eeo.workAuthorized ? 'Yes' : 'No') : '',
        requiresSponsorship: eeo.requiresSponsorship != null ? (eeo.requiresSponsorship ? 'Yes' : 'No') : '',
        veteranStatus: humanizeEeo(eeo.veteranStatus, VETERAN_MAP),
        disabilityStatus: humanizeEeo(eeo.disabilityStatus, DISABILITY_MAP),
        gender: humanizeEeo(eeo.gender, GENDER_MAP),
        raceEthnicity: humanizeEeo(eeo.raceEthnicity, RACE_MAP),

        desiredSalary: prefs.desiredSalaryMin ? `$${prefs.desiredSalaryMin}` : '',
        availableDate: prefs.availableDate || '',

        felonyConviction: allScreening.felony_conviction?.answer != null ? (allScreening.felony_conviction.answer ? 'Yes' : 'No') : '',
        licenseRevoked: allScreening.license_revoked?.answer != null ? (allScreening.license_revoked.answer ? 'Yes' : 'No') : '',
        backgroundCheck: allScreening.consent_background_check?.answer != null ? (allScreening.consent_background_check.answer ? 'Yes' : 'No') : '',
        drugScreen: allScreening.consent_drug_screen?.answer != null ? (allScreening.consent_drug_screen.answer ? 'Yes' : 'No') : '',

        resumeUrl: meta.resumeUrl || '',
    };

    log(`[PMHNP-Match] EEO mapped → gender="${result.gender}" race="${result.raceEthnicity}" veteran="${result.veteranStatus}" disability="${result.disabilityStatus}"`);
    return result;
}
