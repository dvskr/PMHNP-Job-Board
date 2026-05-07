/**
 * Sprint 2.1.P6 — EEO negative test for the resume parser.
 *
 * Asserts that the sanitization step strips ALL protected-attribute
 * fields, even when the LLM hallucinates them into its response.
 *
 * The test calls `sanitizeParsedResume()` directly with a synthetic
 * "model output" that includes every EEO category we care about:
 *   gender, race, ethnicity, age, dob, dateOfBirth, religion,
 *   maritalStatus, sexualOrientation, disabilityStatus, veteranStatus,
 *   nationalOrigin
 *
 * The sanitizer should produce an object whose keys are limited to
 * the explicit allowlist defined by the ParsedResume interface.
 *
 * Why this exists:
 *   - Hiring decisions on EEO data is illegal under Title VII / ADEA /
 *     ADA and triggers PHI/PII concerns.
 *   - Even if our prompt forbids the model from returning these fields,
 *     a future prompt rewrite or model swap could leak them through.
 *     Sanitization is the load-bearing gate.
 *   - The EEO golden case in tests/ai/golden/resume-parsing.json
 *     exercises the model end-to-end, but it can't catch a regression
 *     where a future code change accepts unknown keys without filtering.
 *     This unit test does.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeParsedResume, type ParsedResume } from '@/lib/resume-parser';

const EEO_KEYS = [
    'gender',
    'race',
    'ethnicity',
    'age',
    'dob',
    'dateOfBirth',
    'religion',
    'maritalStatus',
    'sexualOrientation',
    'disabilityStatus',
    'veteranStatus',
    'nationalOrigin',
    'pregnancyStatus',
    'genderIdentity',
] as const;

/** The full set of keys the sanitizer is allowed to emit.
 *  Mirrors the keys spread in `sanitizeParsedResume()` in lib/resume-parser.ts.
 *  When a new professional field is added there, add it here too. */
const ALLOWED_PARSED_KEYS = new Set<keyof ParsedResume>([
    'firstName',
    'lastName',
    'headline',
    'professionalSummary',
    'phone',
    'linkedinUrl',
    'yearsExperience',
    'certifications',
    'licenseStates',
    'specialties',
    'skills',
    'npiNumber',
    'deaNumber',
    'licenses',
    'certificationRecords',
    'education',
    'workExperience',
]);

describe('Resume parser — EEO negative test (Sprint 2.1.P6)', () => {
    it('strips every protected attribute the model might leak', () => {
        // Cast to unknown then ParsedResume so we can include keys that
        // are intentionally NOT in the interface — the whole point is
        // that the sanitizer must drop them.
        const polluted = {
            firstName: 'Patricia',
            lastName: 'Kim',
            headline: 'PMHNP-BC',
            // every EEO field set to a plausible value
            gender: 'Female',
            race: 'Asian American',
            ethnicity: 'Asian',
            age: 38,
            dob: '1988-03-15',
            dateOfBirth: '1988-03-15',
            religion: 'Buddhist',
            maritalStatus: 'Married',
            sexualOrientation: 'Straight',
            disabilityStatus: 'None',
            veteranStatus: 'Non-veteran',
            nationalOrigin: 'United States',
            pregnancyStatus: 'No',
            genderIdentity: 'Cis female',
        } as unknown as ParsedResume;

        const cleaned = sanitizeParsedResume(polluted);

        for (const key of EEO_KEYS) {
            expect(
                Object.prototype.hasOwnProperty.call(cleaned, key),
                `Sanitizer leaked EEO field '${key}' — this is a HIPAA/Title VII regression`,
            ).toBe(false);
        }
    });

    it('only emits keys from the explicit allowlist', () => {
        const polluted = {
            firstName: 'Test',
            lastName: 'User',
            // Realistic professional fields PLUS unknown junk that should drop
            specialties: ['Adult Psychiatry'],
            licenseStates: ['CA'],
            unknownVendorField: 'should be dropped',
            ssn: '123-45-6789',
            creditScore: 800,
            address: '123 Main St',
            email: 'leaked@example.com',
        } as unknown as ParsedResume;

        const cleaned = sanitizeParsedResume(polluted);

        for (const key of Object.keys(cleaned)) {
            expect(
                ALLOWED_PARSED_KEYS.has(key as keyof ParsedResume),
                `Sanitizer emitted unexpected key '${key}'; allowlist is the contract`,
            ).toBe(true);
        }
    });

    it('preserves legitimate professional fields when EEO fields are also present', () => {
        const mixed = {
            firstName: 'Maria',
            lastName: 'Sanchez',
            yearsExperience: 8,
            npiNumber: '1234567893',
            deaNumber: 'BS1234567',
            certifications: ['PMHNP-BC'],
            licenseStates: ['CA', 'OR'],
            // EEO trap fields
            gender: 'Female',
            race: 'Hispanic',
            dob: '1985-01-01',
        } as unknown as ParsedResume;

        const cleaned = sanitizeParsedResume(mixed);

        expect(cleaned.firstName).toBe('Maria');
        expect(cleaned.lastName).toBe('Sanchez');
        expect(cleaned.yearsExperience).toBe(8);
        expect(cleaned.npiNumber).toBe('1234567893');
        expect(cleaned.deaNumber).toBe('BS1234567');
        expect(cleaned.certifications).toEqual(['PMHNP-BC']);
        expect(cleaned.licenseStates).toEqual(['CA', 'OR']);
    });

    it('yields a structurally identical shape regardless of EEO injection', () => {
        // Run on a clean payload and a polluted one; the keysets must match.
        const clean: ParsedResume = {
            firstName: 'Alex',
            yearsExperience: 5,
            certifications: ['PMHNP-BC'],
        };
        const polluted = {
            ...clean,
            gender: 'Nonbinary',
            religion: 'Atheist',
            sexualOrientation: 'Bi',
        } as unknown as ParsedResume;

        const cleanedA = sanitizeParsedResume(clean);
        const cleanedB = sanitizeParsedResume(polluted);

        // Both outputs must have identical key shapes — the sanitizer's
        // contract is "allowlist in, allowlist out" regardless of input
        // pollution.
        expect(new Set(Object.keys(cleanedA))).toEqual(new Set(Object.keys(cleanedB)));
    });
});
