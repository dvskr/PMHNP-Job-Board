/**
 * Core Profile Patterns — Universal fields for any profession.
 *
 * These patterns match standard job application fields:
 * name, email, phone, address, education, work experience,
 * EEO/compliance, and common screening questions.
 */

import type { FieldPatternConfig } from './types';

export const CORE_PATTERNS: FieldPatternConfig = {
    name: 'core',
    displayName: 'Universal (All Professions)',
    description: 'Standard fields found on virtually every job application',

    // Standard patterns — matched against id + name + label + placeholder
    fieldMap: [
        // Personal — order matters: more specific patterns first
        [/first[-_\s]?name/i, 'firstName'],
        [/last[-_\s]?name/i, 'lastName'],
        [/\bfull[-_\s]?name\b/i, 'fullName'],
        [/confirm.*email|email.*confirm|verify.*email/i, 'email'],
        [/e[-_]?mail(?!.*confirm)/i, 'email'],
        [/phone|mobile|tel(?:ephone)?/i, 'phone'],
        [/\bcurrent[-_\s]?location\b|\blocation\b/i, 'location'],
        [/\bcity\b/i, 'city'],
        [/zip|postal/i, 'zip'],
        [/country/i, 'country'],
        [/address[-_]?(?:line)?[-_]?1|street[-_]?address/i, 'addressLine1'],
        [/address[-_]?(?:line)?[-_]?2|\bapt\b|\bsuite\b|\bunit\b/i, 'addressLine2'],
        [/linkedin/i, 'linkedinUrl'],
        [/\bwebsite\b|\bportfolio\b|personal[-_\s]?(?:site|page|url)|\burl\b/i, 'websiteUrl'],

        // Credentials — MUST be before generic 'state' to avoid false positives
        [/npi/i, 'npiNumber'],
        [/dea[-_]?(?:number|#|no)/i, 'deaNumber'],
        [/license[-_\s]?type/i, 'licenseType'],
        [/license[-_]?(?:number|#|no)/i, 'licenseNumber'],
        [/license[-_]?state|state[-_]?of[-_]?licensure/i, 'licenseState'],
        [/cert(?:ification)?[-_]?(?:number|#|no)/i, 'certificationNumber'],

        // Clinical
        [/(?:primary[-_\s]?)?specialty|specialization/i, 'primarySpecialty'],

        // Screening
        [/revoked|suspended.*license/i, 'licenseRevoked'],

        // Generic state — after license-state to prevent swallowing
        [/\bstate\b|province/i, 'state'],

        // Education
        [/school|university|institution|college/i, 'schoolName'],
        [/degree/i, 'degreeType'],
        [/field[-_]?of[-_]?study|major/i, 'fieldOfStudy'],
        [/graduation|grad[-_]?date/i, 'graduationDate'],

        // Experience — currentJobTitle MUST come before yearsExperience
        [/(?:current[-_\s]?)?(?:job[-_\s]?)?title|current[-_\s]?position/i, 'currentJobTitle'],
        [/current[-_\s]?(?:company|employer|organization)|employer[-_\s]?name|\bcompany\b/i, 'currentEmployer'],
        [/years?[-_\s]?(?:of[-_\s]?)?experience|total[-_\s]?experience|how[-_\s]?(?:many|much)[-_\s]?(?:years?|experience)/i, 'yearsExperience'],
        [/currently[-_\s]?work[-_\s]?here|i[-_\s]?currently[-_\s]?work/i, 'currentlyWorkHere'],

        // EEO / Compliance
        [/(?:work[-_]?)?auth/i, 'workAuthorized'],
        [/sponsor/i, 'requiresSponsorship'],
        [/veteran/i, 'veteranStatus'],
        [/disab/i, 'disabilityStatus'],
        [/gender|sex/i, 'gender'],
        [/race|ethnicity/i, 'raceEthnicity'],

        // Preferences
        [/salary|compensation|pay/i, 'desiredSalary'],
        [/availab(?:le|ility)[-_\s]?(?:date|start)|earliest[-_\s]?(?:start|date)|when[-_\s]?(?:can|could)[-_\s]?you[-_\s]?start/i, 'availableDate'],

        // Screening
        [/felony/i, 'felonyConviction'],
        [/background[-_]?check|consent.*background/i, 'backgroundCheck'],
        [/drug[-_]?(?:screen|test)/i, 'drugScreen'],
    ],

    // Strict patterns — matched against id + name only (not label text)
    strictFieldMap: [
        [/employer|company(?:[-_]?name)?|organization/i, 'currentEmployer'],
        [/headline|professional[-_]?summary/i, 'headline'],

        // Work experience date fields (Workday IDs: workExperience-N--startDate-dateSectionMonth-input)
        [/workExperience.*startDate.*Month/i, 'workStartMonth'],
        [/workExperience.*startDate.*Year/i, 'workStartYear'],
        [/workExperience.*endDate.*Month/i, 'workEndMonth'],
        [/workExperience.*endDate.*Year/i, 'workEndYear'],

        // Education year fields (Workday IDs: education-N--firstYearAttended-dateSectionYear-input)
        [/education.*firstYearAttended.*Year/i, 'educationStartYear'],
        [/education.*lastYearAttended.*Year/i, 'educationEndYear'],
    ],

    // ATS-specific attribute maps
    dataAutomationMap: {
        // Workday
        'legalNameSection_firstName': 'firstName',
        'legalNameSection_lastName': 'lastName',
        'addressSection_addressLine1': 'addressLine1',
        'addressSection_city': 'city',
        'addressSection_countryRegion': 'state',
        'addressSection_postalCode': 'zip',
        'addressSection_countryReference': 'country',
        'veteranStatus': 'veteranStatus',
        'disabilityStatus': 'disabilityStatus',
        'phone-number': 'phone',
        'email': 'email',
        'jobTitle': 'currentJobTitle',
        'company': 'currentEmployer',
    },

    // Lever exact-name attribute map
    exactNameMap: {
        'name': 'fullName',
        'email': 'email',
        'phone': 'phone',
        'org': 'currentEmployer',
        'urls[linkedin]': 'linkedinUrl',
        'urls[twitter]': 'websiteUrl',
        'urls[github]': 'websiteUrl',
        'urls[portfolio]': 'websiteUrl',
    },
};
