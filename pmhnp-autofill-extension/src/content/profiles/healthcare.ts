/**
 * Healthcare Profile Patterns — Fields specific to healthcare/nursing/clinical roles.
 *
 * Covers: NPI/DEA numbers, license types/numbers/states, certifications,
 * clinical specialties, and healthcare-specific screening questions.
 */

import type { FieldPatternConfig } from './types';

export const HEALTHCARE_PATTERNS: FieldPatternConfig = {
    name: 'healthcare',
    displayName: 'Healthcare / Nursing / Clinical',
    description: 'NPI, DEA, licenses, certifications, clinical specialties',

    fieldMap: [
        // Credentials — must come before generic 'state' to avoid false positives
        [/npi/i, 'npiNumber'],
        [/dea[-_]?(?:number|#|no)/i, 'deaNumber'],
        [/license[-_\s]?type/i, 'licenseType'],
        [/license[-_]?(?:number|#|no)/i, 'licenseNumber'],
        [/license[-_]?state|state[-_]?of[-_]?licensure/i, 'licenseState'],
        [/cert(?:ification)?[-_]?(?:number|#|no)/i, 'certificationNumber'],

        // Clinical
        [/(?:primary[-_\s]?)?specialty|specialization/i, 'primarySpecialty'],

        // Healthcare-specific screening
        [/revoked|suspended.*license/i, 'licenseRevoked'],
        [/malpractice/i, 'malpracticeHistory'],
        [/cme|continuing[-_\s]?(?:medical|education)/i, 'cmeCredits'],
        [/board[-_\s]?certified/i, 'boardCertified'],
        [/privileges|credentialing/i, 'hospitalPrivileges'],

        // Telehealth
        [/telehealth|telemedicine|remote[-_\s]?patient/i, 'telehealthExperience'],
        [/compact[-_\s]?license|multi[-_\s]?state/i, 'compactLicense'],
    ],

    strictFieldMap: [],

    dataAutomationMap: {
        // Workday healthcare-specific automation IDs
        'npiNumber': 'npiNumber',
        'deaNumber': 'deaNumber',
        'licenseType': 'licenseType',
        'licenseNumber': 'licenseNumber',
        'licenseState': 'licenseState',
        'certificationNumber': 'certificationNumber',
        'specialty': 'primarySpecialty',
    },

    exactNameMap: {},
};
