import type { DetectedField, MappedField, ProfileData, License } from '@/shared/types';
import { US_STATES, STATE_ABBREVIATION_TO_NAME } from '@/shared/constants';

// ─── Core Mapping ───

export function mapFieldsToProfile(fields: DetectedField[], profile: ProfileData): MappedField[] {
    return fields.map((field) => mapSingleField(field, profile)).filter(Boolean) as MappedField[];
}

function mapSingleField(field: DetectedField, profile: ProfileData): MappedField | null {
    // Pass unknown/low-confidence fields through for AI classification instead of dropping
    if (field.identifier === 'unknown' && field.confidence < 0.3) {
        return {
            field,
            profileKey: 'unknown',
            value: '',
            fillMethod: 'text',
            requiresAI: true,
            requiresFile: false,
            documentType: null,
            confidence: field.confidence,
            status: 'needs_ai_classification' as MappedField['status'],
        };
    }

    // Open-ended questions (but NOT message/cover_letter which have direct mappings)
    if ((field.identifier === 'open_ended_question' || field.fieldCategory === 'open_ended') &&
        field.identifier !== 'message' && field.identifier !== 'cover_letter') {
        return {
            field,
            profileKey: 'openEndedResponses',
            value: '',
            fillMethod: 'ai_generate',
            requiresAI: true,
            requiresFile: false,
            documentType: null,
            confidence: field.confidence,
            status: 'needs_ai',
        };
    }

    // File uploads
    if (field.fieldType === 'file') {
        return mapFileField(field, profile);
    }

    // Direct mapping
    const mapping = getDirectMapping(field, profile);
    if (!mapping) return null;

    // Determine fill method
    let fillMethod: MappedField['fillMethod'] = 'text';
    if (field.fieldType === 'select') fillMethod = 'select';
    else if (field.fieldType === 'radio') fillMethod = 'radio';
    else if (field.fieldType === 'checkbox') fillMethod = 'checkbox';
    else if (field.identifier.includes('date') || field.identifier.includes('expiration') || field.identifier.includes('graduation')) fillMethod = 'date';

    // For selects, try to match the value to an option
    let value = mapping.value;
    if (fillMethod === 'select' && field.options.length > 0 && typeof value === 'string') {
        const matched = matchDropdownOption(value, field.options);
        if (matched) value = matched;
    }

    const status: MappedField['status'] =
        value === '' || value === null || value === undefined
            ? 'no_data'
            : mapping.confidence < 0.5
                ? 'ambiguous'
                : 'ready';

    return {
        field,
        profileKey: mapping.profileKey,
        value: value ?? '',
        fillMethod,
        requiresAI: false,
        requiresFile: false,
        documentType: null,
        confidence: mapping.confidence,
        status,
    };
}

// ─── Direct Mapping Table ───

interface DirectMapping {
    profileKey: string;
    value: string | boolean;
    confidence: number;
}

function getDirectMapping(field: DetectedField, profile: ProfileData): DirectMapping | null {
    const p = profile.personal;
    const c = profile.credentials;
    const e = profile.eeo;
    const pref = profile.preferences;

    const map: Record<string, () => DirectMapping | null> = {
        first_name: () => ({ profileKey: 'personal.firstName', value: p.firstName || '', confidence: field.confidence }),
        last_name: () => ({ profileKey: 'personal.lastName', value: p.lastName || '', confidence: field.confidence }),
        full_name: () => ({ profileKey: 'personal.fullName', value: `${p.firstName || ''} ${p.lastName || ''}`.trim(), confidence: field.confidence }),
        email: () => ({ profileKey: 'personal.email', value: p.email || '', confidence: field.confidence }),
        confirm_email: () => ({ profileKey: 'personal.email', value: p.email || '', confidence: field.confidence }),
        phone: () => ({ profileKey: 'personal.phone', value: p.phone || '', confidence: field.confidence }),
        address_line1: () => ({ profileKey: 'personal.address.line1', value: p.address.line1 || '', confidence: field.confidence }),
        address_line2: () => ({ profileKey: 'personal.address.line2', value: p.address.line2 || '', confidence: field.confidence }),
        city: () => ({ profileKey: 'personal.address.city', value: p.address.city || '', confidence: field.confidence }),
        state: () => ({ profileKey: 'personal.address.state', value: p.address.state || '', confidence: field.confidence }),
        zip: () => ({ profileKey: 'personal.address.zip', value: p.address.zip || '', confidence: field.confidence }),
        country: () => ({ profileKey: 'personal.address.country', value: p.address.country || 'US', confidence: field.confidence }),
        linkedin: () => ({ profileKey: 'personal.linkedinUrl', value: p.linkedinUrl || '', confidence: field.confidence }),
        website: () => ({ profileKey: 'personal.website', value: '', confidence: 0.3 }),
        headline: () => ({ profileKey: 'personal.headline', value: p.headline || '', confidence: field.confidence }),
        middle_name: () => ({ profileKey: 'personal.middleName', value: '', confidence: 0.3 }),
        preferred_name: () => ({ profileKey: 'personal.preferredName', value: p.firstName || '', confidence: field.confidence }),

        // Credentials
        npi_number: () => ({ profileKey: 'credentials.npiNumber', value: c.npiNumber || '', confidence: field.confidence }),
        dea_number: () => ({ profileKey: 'credentials.deaNumber', value: c.deaNumber || '', confidence: field.confidence }),
        dea_expiration: () => ({ profileKey: 'credentials.deaExpirationDate', value: formatDate(c.deaExpirationDate), confidence: field.confidence }),
        dea_schedule: () => ({ profileKey: 'credentials.deaScheduleAuthority', value: c.deaScheduleAuthority || '', confidence: field.confidence }),
        prescriptive_authority: () => ({
            profileKey: 'practiceAuthority.prescriptiveAuthorityStatus',
            value: profile.practiceAuthority.prescriptiveAuthorityStatus || '',
            confidence: field.confidence,
        }),
        csr_number: () => ({ profileKey: 'credentials.stateControlledSubstanceReg', value: c.stateControlledSubstanceReg || '', confidence: field.confidence }),
        pmp_registered: () => ({ profileKey: 'credentials.pmpRegistered', value: c.pmpRegistered ?? false, confidence: field.confidence }),
        malpractice_carrier: () => ({ profileKey: 'malpractice.carrier', value: profile.malpractice.carrier || '', confidence: field.confidence }),
        malpractice_policy: () => ({ profileKey: 'malpractice.policyNumber', value: profile.malpractice.policyNumber || '', confidence: field.confidence }),
        malpractice_coverage: () => ({ profileKey: 'malpractice.coverage', value: profile.malpractice.coverage || '', confidence: field.confidence }),

        // License fields - pick best match
        license_number: () => {
            const license = findBestLicenseForContext(c.licenses, {});
            return license
                ? { profileKey: 'credentials.licenses[0].licenseNumber', value: license.licenseNumber, confidence: field.confidence }
                : { profileKey: 'credentials.licenses[0].licenseNumber', value: '', confidence: 0.3 };
        },
        license_state: () => {
            const license = findBestLicenseForContext(c.licenses, {});
            return license
                ? { profileKey: 'credentials.licenses[0].licenseState', value: license.licenseState, confidence: field.confidence }
                : null;
        },
        license_expiration: () => {
            const license = findBestLicenseForContext(c.licenses, {});
            return license
                ? { profileKey: 'credentials.licenses[0].expirationDate', value: formatDate(license.expirationDate), confidence: field.confidence }
                : null;
        },

        // Certification
        certification_number: () => {
            const cert = c.certifications[0];
            return cert
                ? { profileKey: 'credentials.certifications[0].certificationNumber', value: cert.certificationNumber || '', confidence: field.confidence }
                : null;
        },

        // Education
        degree: () => {
            const edu = profile.education.find((e) => e.isHighestDegree) || profile.education[0];
            return edu
                ? { profileKey: 'education[0].degreeType', value: edu.degreeType, confidence: field.confidence }
                : null;
        },
        school: () => {
            const edu = profile.education.find((e) => e.isHighestDegree) || profile.education[0];
            return edu
                ? { profileKey: 'education[0].schoolName', value: edu.schoolName, confidence: field.confidence }
                : null;
        },
        graduation_date: () => {
            const edu = profile.education.find((e) => e.isHighestDegree) || profile.education[0];
            return edu
                ? { profileKey: 'education[0].graduationDate', value: formatDate(edu.graduationDate), confidence: field.confidence }
                : null;
        },
        field_of_study: () => {
            const edu = profile.education.find((e) => e.isHighestDegree) || profile.education[0];
            return edu
                ? { profileKey: 'education[0].fieldOfStudy', value: edu.fieldOfStudy || '', confidence: field.confidence }
                : null;
        },
        gpa: () => {
            const edu = profile.education.find((e) => e.isHighestDegree) || profile.education[0];
            return edu?.gpa ? { profileKey: 'education[0].gpa', value: edu.gpa, confidence: field.confidence } : null;
        },

        // Experience
        job_title: () => {
            const work = profile.workExperience[0];
            return work ? { profileKey: 'workExperience[0].jobTitle', value: work.jobTitle, confidence: field.confidence } : null;
        },
        employer: () => {
            const work = profile.workExperience[0];
            return work ? { profileKey: 'workExperience[0].employerName', value: work.employerName, confidence: field.confidence } : null;
        },
        start_date: () => {
            const work = profile.workExperience[0];
            return work ? { profileKey: 'workExperience[0].startDate', value: formatDate(work.startDate), confidence: field.confidence } : null;
        },
        end_date: () => {
            const work = profile.workExperience[0];
            if (!work) return null;
            // Skip if current job — 'Present' is not a valid date
            if (work.isCurrent) return { profileKey: 'workExperience[0].endDate', value: '', confidence: 0 };
            return { profileKey: 'workExperience[0].endDate', value: formatDate(work.endDate), confidence: field.confidence };
        },
        supervisor: () => {
            const work = profile.workExperience[0];
            return work?.supervisorName ? { profileKey: 'workExperience[0].supervisorName', value: work.supervisorName, confidence: field.confidence } : null;
        },
        reason_leaving: () => {
            const work = profile.workExperience[0];
            return work?.reasonForLeaving ? { profileKey: 'workExperience[0].reasonForLeaving', value: work.reasonForLeaving, confidence: field.confidence } : null;
        },
        years_experience: () => {
            // Try to calculate from work experience if not in profile
            const work = profile.workExperience;
            if (work.length > 0) {
                const earliest = work.reduce((min, w) => {
                    const d = new Date(w.startDate).getTime();
                    return d < min ? d : min;
                }, Date.now());
                const years = Math.floor((Date.now() - earliest) / (365.25 * 24 * 60 * 60 * 1000));
                return { profileKey: 'computed.yearsExperience', value: years.toString(), confidence: field.confidence };
            }
            return null;
        },
        patient_volume: () => {
            const work = profile.workExperience[0];
            return work?.clinicalDetails?.patientVolume
                ? { profileKey: 'workExperience[0].clinicalDetails.patientVolume', value: work.clinicalDetails.patientVolume, confidence: field.confidence }
                : null;
        },
        ehr_systems: () => {
            const work = profile.workExperience[0];
            const systems = work?.clinicalDetails?.ehrSystems;
            return systems && systems.length > 0
                ? { profileKey: 'workExperience[0].clinicalDetails.ehrSystems', value: systems.join(', '), confidence: field.confidence }
                : null;
        },
        telehealth_experience: () => {
            const work = profile.workExperience.find(w => w.clinicalDetails?.telehealthExperience);
            if (work) {
                const platforms = work.clinicalDetails?.telehealthPlatforms || [];
                const value = platforms.length > 0 ? `Yes — ${platforms.join(', ')}` : 'Yes';
                return { profileKey: 'workExperience[0].clinicalDetails.telehealthExperience', value, confidence: field.confidence };
            }
            return { profileKey: 'workExperience[0].clinicalDetails.telehealthExperience', value: 'No', confidence: 0.5 };
        },
        practice_setting: () => {
            const work = profile.workExperience[0];
            return work?.clinicalDetails?.practiceSetting
                ? { profileKey: 'workExperience[0].clinicalDetails.practiceSetting', value: work.clinicalDetails.practiceSetting, confidence: field.confidence }
                : null;
        },

        // Reference fields (first reference)
        reference_name: () => {
            const ref = profile.references?.[0];
            return ref ? { profileKey: 'references[0].fullName', value: ref.fullName, confidence: field.confidence } : null;
        },
        reference_title: () => {
            const ref = profile.references?.[0];
            return ref?.title ? { profileKey: 'references[0].title', value: ref.title, confidence: field.confidence } : null;
        },
        reference_phone: () => {
            const ref = profile.references?.[0];
            return ref?.phone ? { profileKey: 'references[0].phone', value: ref.phone, confidence: field.confidence } : null;
        },
        reference_email: () => {
            const ref = profile.references?.[0];
            return ref?.email ? { profileKey: 'references[0].email', value: ref.email, confidence: field.confidence } : null;
        },
        reference_relationship: () => {
            const ref = profile.references?.[0];
            return ref?.relationship ? { profileKey: 'references[0].relationship', value: ref.relationship, confidence: field.confidence } : null;
        },

        // Screening
        work_authorized: () => ({ profileKey: 'eeo.workAuthorized', value: e.workAuthorized ?? true, confidence: field.confidence }),
        visa_sponsorship: () => ({ profileKey: 'eeo.requiresSponsorship', value: e.requiresSponsorship ?? false, confidence: field.confidence }),
        veteran: () => ({ profileKey: 'eeo.veteranStatus', value: e.veteranStatus || '', confidence: field.confidence }),
        disability: () => ({ profileKey: 'eeo.disabilityStatus', value: e.disabilityStatus || '', confidence: field.confidence }),
        race_ethnicity: () => ({ profileKey: 'eeo.raceEthnicity', value: e.raceEthnicity || '', confidence: field.confidence }),
        gender: () => ({ profileKey: 'eeo.gender', value: e.gender || '', confidence: field.confidence }),

        salary: () => {
            if (pref.desiredSalaryMin && pref.desiredSalaryMax) {
                return { profileKey: 'preferences.desiredSalary', value: `$${pref.desiredSalaryMin.toLocaleString()} - $${pref.desiredSalaryMax.toLocaleString()}`, confidence: field.confidence };
            }
            if (pref.desiredSalaryMin) {
                return { profileKey: 'preferences.desiredSalaryMin', value: pref.desiredSalaryMin.toString(), confidence: field.confidence };
            }
            return null;
        },
        start_date_available: () => ({ profileKey: 'preferences.availableDate', value: formatDate(pref.availableDate), confidence: field.confidence }),
        work_mode: () => ({ profileKey: 'preferences.preferredWorkMode', value: pref.preferredWorkMode || '', confidence: field.confidence }),
        job_type: () => ({ profileKey: 'preferences.preferredJobType', value: pref.preferredJobType || '', confidence: field.confidence }),
        willing_to_relocate: () => mapScreeningAnswer(field, profile, 'willing_to_relocate'),
        willing_to_travel: () => mapScreeningAnswer(field, profile, 'willing_to_travel'),

        felony: () => mapScreeningAnswer(field, profile, 'felony_conviction'),
        misdemeanor: () => mapScreeningAnswer(field, profile, 'misdemeanor_conviction'),
        license_revoked: () => mapScreeningAnswer(field, profile, 'license_revoked'),
        malpractice: () => mapScreeningAnswer(field, profile, 'malpractice_claim'),
        background_check: () => ({ profileKey: 'screening.background_check', value: true, confidence: field.confidence }),
        drug_screen: () => ({ profileKey: 'screening.drug_screen', value: true, confidence: field.confidence }),

        // Message / Cover letter
        message: () => {
            const name = `${p.firstName || ''} ${p.lastName || ''}`.trim();
            const msg = `I am writing to express my strong interest in this position. As a Psychiatric-Mental Health Nurse Practitioner (PMHNP) with clinical experience, I am confident I can make a meaningful contribution to your team. I look forward to discussing how my skills and experience align with your needs.\n\nBest regards,\n${name}`;
            return { profileKey: 'personal.message', value: msg, confidence: field.confidence };
        },
        cover_letter: () => {
            const name = `${p.firstName || ''} ${p.lastName || ''}`.trim();
            const msg = `I am writing to express my strong interest in this position. As a Psychiatric-Mental Health Nurse Practitioner (PMHNP) with clinical experience, I am confident I can make a meaningful contribution to your team. I look forward to discussing how my skills and experience align with your needs.\n\nBest regards,\n${name}`;
            return { profileKey: 'personal.coverLetter', value: msg, confidence: field.confidence };
        },
    };

    const mapper = map[field.identifier];
    return mapper ? mapper() : null;
}

function mapScreeningAnswer(field: DetectedField, profile: ProfileData, key: string): DirectMapping | null {
    const allAnswers = { ...profile.screeningAnswers.background, ...profile.screeningAnswers.clinical, ...profile.screeningAnswers.logistics };
    const answer = allAnswers[key];
    if (answer) {
        return { profileKey: `screeningAnswers.${key}`, value: answer.answer ?? false, confidence: field.confidence };
    }
    return { profileKey: `screeningAnswers.${key}`, value: false, confidence: Math.max(0.3, field.confidence - 0.2) };
}

function mapFileField(field: DetectedField, profile: ProfileData): MappedField | null {
    const label = (field.label + ' ' + field.placeholder + ' ' + field.ariaLabel).toLowerCase();
    let documentType: string | null = null;

    if (label.includes('resume') || label.includes('cv')) documentType = 'resume';
    else if (label.includes('cover letter')) documentType = 'cover_letter';
    else if (label.includes('license')) documentType = 'license';
    else if (label.includes('dea')) documentType = 'dea_registration';
    else if (label.includes('certification') || label.includes('ancc')) documentType = 'certification';
    else if (label.includes('malpractice') || label.includes('insurance')) documentType = 'malpractice_certificate';
    else documentType = null;

    return {
        field,
        profileKey: `documents.${documentType || 'unknown'}`,
        value: '',
        fillMethod: 'file',
        requiresAI: false,
        requiresFile: true,
        documentType,
        confidence: documentType ? field.confidence : 0.3,
        status: 'needs_file',
    };
}

// ─── Helpers ───

export function findBestLicenseForContext(licenses: License[], context: { state?: string; type?: string }): License | null {
    if (licenses.length === 0) return null;

    // Filter by context
    let candidates = [...licenses];

    if (context.state) {
        const stateMatch = candidates.filter(
            (l) => l.licenseState.toLowerCase() === context.state!.toLowerCase() ||
                l.licenseState === (US_STATES[context.state!] || context.state) ||
                l.licenseState === (STATE_ABBREVIATION_TO_NAME[context.state!.toUpperCase()] || context.state)
        );
        if (stateMatch.length > 0) candidates = stateMatch;
    }

    if (context.type) {
        const typeMatch = candidates.filter(
            (l) => l.licenseType.toLowerCase().includes(context.type!.toLowerCase())
        );
        if (typeMatch.length > 0) candidates = typeMatch;
    }

    // Prefer APRN over RN, active over inactive
    const sorted = candidates.sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (b.status === 'active' && a.status !== 'active') return 1;
        if (a.licenseType.includes('APRN') && !b.licenseType.includes('APRN')) return -1;
        if (b.licenseType.includes('APRN') && !a.licenseType.includes('APRN')) return 1;
        return 0;
    });

    return sorted[0] || null;
}

export function matchDropdownOption(profileValue: string, options: string[]): string | null {
    if (!profileValue || options.length === 0) return null;
    const normalizedValue = profileValue.toLowerCase().trim();

    // Exact match
    const exact = options.find((o) => o.toLowerCase().trim() === normalizedValue);
    if (exact) return exact;

    // State abbreviation ↔ full name
    const stateName = STATE_ABBREVIATION_TO_NAME[profileValue.toUpperCase()];
    if (stateName) {
        const stateMatch = options.find((o) => o.toLowerCase().includes(stateName.toLowerCase()));
        if (stateMatch) return stateMatch;
    }
    const stateAbbr = US_STATES[profileValue];
    if (stateAbbr) {
        const abbrMatch = options.find((o) => o.trim().toUpperCase() === stateAbbr);
        if (abbrMatch) return abbrMatch;
    }

    // Contains match
    const containsMatch = options.find((o) => o.toLowerCase().includes(normalizedValue));
    if (containsMatch) return containsMatch;

    // Profile value contains option
    const reverseMatch = options.find((o) => normalizedValue.includes(o.toLowerCase().trim()) && o.trim().length > 1);
    if (reverseMatch) return reverseMatch;

    // Fuzzy match — find closest option
    let bestOption = null;
    let bestScore = 0.4; // minimum threshold
    for (const option of options) {
        const score = fuzzyMatch(normalizedValue, option.toLowerCase());
        if (score > bestScore) {
            bestScore = score;
            bestOption = option;
        }
    }

    return bestOption;
}

export function fuzzyMatch(text1: string, text2: string): number {
    const s1 = text1.toLowerCase().trim();
    const s2 = text2.toLowerCase().trim();

    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    // Simple Levenshtein-based similarity
    const maxLen = Math.max(s1.length, s2.length);
    const distance = levenshtein(s1, s2);
    return 1 - distance / maxLen;
}

function levenshtein(s1: string, s2: string): number {
    const len1 = s1.length;
    const len2 = s2.length;
    const dp: number[][] = Array.from({ length: len1 + 1 }, (_, i) =>
        Array.from({ length: len2 + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }

    return dp[len1][len2];
}

function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0]; // YYYY-MM-DD
    } catch {
        return '';
    }
}
