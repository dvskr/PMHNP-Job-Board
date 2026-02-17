/**
 * Deterministic Matcher — maps form field IDs/names/labels to profile values
 * without any AI. Fast, free, and reliable for the ~90% of fields that are obvious.
 */

import type { ScannedField } from './scanner';
import { log, warn } from '@/shared/logger';

// ─── Slim profile shape (only what the extension fills directly) ───

export interface AutofillProfile {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    addressLine1: string;
    addressLine2: string;
    linkedinUrl: string;
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

    // Work (current/most recent)
    currentJobTitle: string;
    currentEmployer: string;
    currentEmployerCity: string;
    currentEmployerState: string;
    yearsExperience: string;

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

// ─── Field ID/name patterns → profile keys ───
// Each entry: [regex pattern, profile key]

// Standard patterns — matched against id + name + label + placeholder
const FIELD_MAP: [RegExp, keyof AutofillProfile][] = [
    // Personal
    [/first[-_\s]?name/i, 'firstName'],
    [/last[-_\s]?name/i, 'lastName'],
    [/confirm.*email|email.*confirm|verify.*email/i, 'email'],
    [/e[-_]?mail(?!.*confirm)/i, 'email'],
    [/phone|mobile|tel(?:ephone)?/i, 'phone'],
    [/city/i, 'city'],
    [/state|province/i, 'state'],
    [/zip|postal/i, 'zip'],
    [/country/i, 'country'],
    [/address[-_]?(?:line)?[-_]?1|street[-_]?address/i, 'addressLine1'],
    [/address[-_]?(?:line)?[-_]?2|\bapt\b|\bsuite\b|\bunit\b/i, 'addressLine2'],
    [/linkedin/i, 'linkedinUrl'],

    // Credentials
    [/npi/i, 'npiNumber'],
    [/dea[-_]?(?:number|#|no)/i, 'deaNumber'],
    [/license[-_\s]?type/i, 'licenseType'],
    [/license[-_]?(?:number|#|no)/i, 'licenseNumber'],
    [/license[-_]?state|state[-_]?of[-_]?licensure/i, 'licenseState'],
    [/cert(?:ification)?[-_]?(?:number|#|no)/i, 'certificationNumber'],

    // Clinical
    [/(?:primary[-_\s]?)?specialty|specialization/i, 'primarySpecialty'],

    // Education
    [/school|university|institution|college/i, 'schoolName'],
    [/degree/i, 'degreeType'],
    [/field[-_]?of[-_]?study|major/i, 'fieldOfStudy'],
    [/graduation|grad[-_]?date/i, 'graduationDate'],

    // Experience
    [/years?[-_\s]?(?:of[-_\s]?)?experience|work[-_\s]?experience|total[-_\s]?experience/i, 'yearsExperience'],

    // EEO
    [/(?:work[-_]?)?auth/i, 'workAuthorized'],
    [/sponsor/i, 'requiresSponsorship'],
    [/veteran/i, 'veteranStatus'],
    [/disab/i, 'disabilityStatus'],
    [/gender|sex/i, 'gender'],
    [/race|ethnicity/i, 'raceEthnicity'],

    // Preferences
    [/salary|compensation|pay/i, 'desiredSalary'],
    [/available|start[-_]?date|earliest/i, 'availableDate'],

    // Screening (yes/no checkboxes)
    [/felony/i, 'felonyConviction'],
    [/revoked|suspended.*license/i, 'licenseRevoked'],
    [/background[-_]?check|consent.*background/i, 'backgroundCheck'],
    [/drug[-_]?(?:screen|test)/i, 'drugScreen'],
];

// Strict patterns — only matched against id + name (NOT label text)
// These are prone to false positives in labels (e.g. "Let the company know...")
const STRICT_FIELD_MAP: [RegExp, keyof AutofillProfile][] = [
    [/(?:job[-_]?)title|current[-_]?position/i, 'currentJobTitle'],
    [/employer|company(?:[-_]?name)?|organization/i, 'currentEmployer'],
    [/headline|professional[-_]?summary/i, 'headline'],
];

// ─── Main matcher function ───

export function deterministicMatch(
    fields: ScannedField[],
    profile: AutofillProfile,
): MatchResult {
    const matched: MatchedField[] = [];
    const unmatched: UnmatchedField[] = [];

    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];

        // Skip file inputs — handled separately via FETCH_FILE
        if (field.type === 'file') {
            // Auto-match file inputs to resumeUrl
            if (profile.resumeUrl) {
                matched.push({
                    index: i,
                    field,
                    profileKey: 'resumeUrl',
                    value: '__FILE_UPLOAD__',
                    interaction: 'file',
                });
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

        // Try strict patterns first (id/name only — avoids false positives)
        let profileKey: keyof AutofillProfile | null = null;
        for (const [pattern, key] of STRICT_FIELD_MAP) {
            if (pattern.test(idNameStr)) {
                profileKey = key;
                break;
            }
        }

        // Then try broad patterns (id + name + label + placeholder)
        if (!profileKey) {
            for (const [pattern, key] of FIELD_MAP) {
                if (pattern.test(fullSearchStr)) {
                    profileKey = key;
                    break;
                }
            }
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
                    } else {
                        // Value doesn't match any option — let AI handle it
                        log(`[PMHNP-Match]   → No matching option — sending to AI`);
                        unmatched.push({ index: i, field });
                    }
                } else {
                    // Select/dropdown with 0 options captured — likely lazy-loaded.
                    // Send to AI; it will see the options at fill-time or handle via custom dropdown.
                    log(`[PMHNP-Match] Select field [${i}] "${field.label.substring(0, 30)}" has 0 options — sending to AI`);
                    unmatched.push({ index: i, field });
                }
            } else {
                matched.push({ index: i, field, profileKey, value, interaction });
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

    // Exact match
    const exact = real.find(o => o.toLowerCase() === lower);
    if (exact) return exact;

    // License type alias expansion (APRN → Nurse Practitioner (NP), etc.)
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

    // State abbreviation expansion (TX → Texas, CA → California, etc.)
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

    // Contains match
    const contains = real.find(o =>
        o.toLowerCase().includes(lower) || lower.includes(o.toLowerCase())
    );
    if (contains) return contains;

    // For yes/no values
    if (['yes', 'true', '1'].includes(lower)) {
        const yesOption = real.find(o => /^yes/i.test(o));
        if (yesOption) return yesOption;
    }
    if (['no', 'false', '0'].includes(lower)) {
        const noOption = real.find(o => /^no/i.test(o));
        if (noOption) return noOption;
    }

    // Word-overlap scoring — handles variations like
    // value="I am a protected veteran" vs option="I am a veteran"
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

    const result: AutofillProfile = {
        firstName: p.firstName || '',
        lastName: p.lastName || '',
        email: p.email || '',
        phone: p.phone || '',
        city: p.address?.city || p.city || '',
        state: p.address?.state || p.state || '',
        zip: p.address?.zip || p.zip || '',
        country: p.address?.country || p.country || '',
        addressLine1: p.address?.line1 || p.addressLine1 || '',
        addressLine2: p.address?.line2 || p.addressLine2 || '',
        linkedinUrl: p.linkedinUrl || '',
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

        currentJobTitle: work.jobTitle || '',
        currentEmployer: work.employerName || '',
        currentEmployerCity: work.employerCity || '',
        currentEmployerState: work.employerState || '',
        yearsExperience: p.yearsExperience ? String(p.yearsExperience) : '',

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
