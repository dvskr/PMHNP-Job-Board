/**
 * Shared test profile — represents a typical PMHNP candidate.
 * Structured to match the format expected by toAutofillProfile().
 */

export const TEST_PROFILE_RAW = {
    personal: {
        firstName: 'Sarah',
        lastName: 'Johnson',
        email: 'sarah.johnson@example.com',
        phone: '(512) 555-0147',
        linkedinUrl: 'https://linkedin.com/in/sarahjohnson-pmhnp',
        headline: 'Board-Certified PMHNP with 8 Years of Experience',
        yearsExperience: 8,
        primarySpecialty: 'Psychiatric Mental Health',
        address: {
            line1: '456 Oak Street',
            line2: 'Apt 12B',
            city: 'Austin',
            state: 'TX',
            zip: '78701',
            country: 'United States',
        },
    },
    credentials: {
        npiNumber: '1234567890',
        deaNumber: 'FJ1234567',
        licenses: [
            {
                licenseType: 'APRN',
                licenseNumber: 'AP-12345',
                licenseState: 'Texas',
            },
        ],
        certifications: [
            {
                certificationNumber: 'ANCC-67890',
            },
        ],
    },
    education: [
        {
            schoolName: 'University of Texas at Austin',
            degreeType: 'Master of Science in Nursing',
            fieldOfStudy: 'Psychiatric Mental Health Nursing',
            graduationDate: '2016-05-15',
        },
    ],
    workExperience: [
        {
            jobTitle: 'Psychiatric Mental Health Nurse Practitioner',
            employerName: 'LifeStance Health',
            employerCity: 'Austin',
            employerState: 'TX',
        },
    ],
    eeo: {
        workAuthorized: true,
        requiresSponsorship: false,
        veteranStatus: 'not_a_veteran',
        disabilityStatus: 'no_disability',
        gender: 'female',
        raceEthnicity: 'white',
    },
    preferences: {
        desiredSalaryMin: 145000,
        availableDate: '2026-03-01',
    },
    screeningAnswers: {
        background: {
            felony_conviction: { answer: false },
            license_revoked: { answer: false },
            consent_background_check: { answer: true },
            consent_drug_screen: { answer: true },
        },
    },
    meta: {
        resumeUrl: 'https://example.com/resume.pdf',
    },
};
