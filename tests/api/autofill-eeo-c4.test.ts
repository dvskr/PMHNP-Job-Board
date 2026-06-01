/**
 * C4 regression — autofill must NOT send EEO self-identification data
 * (race, gender, veteran status, disability status) to OpenAI unless
 * the candidate has explicitly opted in via `sensitiveDataConsent`.
 *
 * Privacy policy §13 declares these fields are never shared with
 * third-party processors. The prior version unconditionally appended
 * them to the LLM prompt. GDPR Art. 9 special-category data leak.
 */
import { describe, it, expect } from 'vitest';
import { buildProfileContext } from '@/app/api/autofill/classify-fields/route';

const baseProfile = {
    firstName: 'Test',
    lastName: 'User',
    email: 't@example.com',
    phone: '555-0000',
    // Standard application fields — these stay in regardless of consent.
    workAuthorized: true,
    requiresSponsorship: false,
    desiredSalary: '$150,000',
};

const eeoFields = {
    gender: 'Female',
    raceEthnicity: 'Hispanic or Latino',
    veteranStatus: 'I am a protected veteran',
    disabilityStatus: 'No, I do not have a disability',
};

describe('autofill C4 — EEO data is gated on sensitiveDataConsent', () => {
    it('EXCLUDES all 4 EEO fields when sensitiveDataConsent is false', () => {
        const ctx = buildProfileContext({ ...baseProfile, ...eeoFields, sensitiveDataConsent: false });
        expect(ctx).not.toContain('Gender:');
        expect(ctx).not.toContain('Race/Ethnicity:');
        expect(ctx).not.toContain('Veteran Status:');
        expect(ctx).not.toContain('Disability Status:');
        // Hard guard — none of the values themselves leak either.
        expect(ctx).not.toContain('Female');
        expect(ctx).not.toContain('Hispanic');
        expect(ctx).not.toContain('protected veteran');
        expect(ctx).not.toContain('do not have a disability');
    });

    it('EXCLUDES all 4 EEO fields when sensitiveDataConsent is undefined (default)', () => {
        const ctx = buildProfileContext({ ...baseProfile, ...eeoFields });
        expect(ctx).not.toContain('Gender:');
        expect(ctx).not.toContain('Race/Ethnicity:');
        expect(ctx).not.toContain('Veteran Status:');
        expect(ctx).not.toContain('Disability Status:');
    });

    it('INCLUDES all 4 EEO fields only when sensitiveDataConsent is exactly true', () => {
        const ctx = buildProfileContext({ ...baseProfile, ...eeoFields, sensitiveDataConsent: true });
        expect(ctx).toContain('Gender: Female');
        expect(ctx).toContain('Race/Ethnicity: Hispanic or Latino');
        expect(ctx).toContain('Veteran Status: I am a protected veteran');
        expect(ctx).toContain('Disability Status: No, I do not have a disability');
    });

    it('KEEPS work-authorization + sponsorship regardless of consent (not special-category)', () => {
        const ctxNo = buildProfileContext({ ...baseProfile, sensitiveDataConsent: false });
        const ctxYes = buildProfileContext({ ...baseProfile, sensitiveDataConsent: true });
        for (const ctx of [ctxNo, ctxYes]) {
            expect(ctx).toContain('Work Authorized in US: Yes');
            expect(ctx).toContain('Requires Sponsorship: No');
        }
    });

    it('does not crash on null / undefined / empty profile', () => {
        expect(() => buildProfileContext(null)).not.toThrow();
        expect(() => buildProfileContext(undefined)).not.toThrow();
        expect(() => buildProfileContext({})).not.toThrow();
    });

    it("falsy 'true' string does NOT count as consent", () => {
        // Defense-in-depth: only Boolean true unlocks; "true" / 1 / etc. must not.
        const ctx = buildProfileContext({ ...baseProfile, ...eeoFields, sensitiveDataConsent: 'true' as unknown as boolean });
        expect(ctx).not.toContain('Gender:');
    });
});
