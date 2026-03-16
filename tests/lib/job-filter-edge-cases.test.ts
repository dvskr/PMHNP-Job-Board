import { describe, it, expect } from 'vitest';
import { isRelevantJob } from '../../lib/utils/job-filter';

describe('isRelevantJob — Edge cases', () => {
    it('handles empty title with relevant description', () => {
        // Filter still passes because description contains PMHNP keywords
        expect(isRelevantJob('', 'psychiatric nurse practitioner')).toBe(true);
    });

    it('handles empty description', () => {
        expect(isRelevantJob('PMHNP', '')).toBe(true);
    });

    it('handles both empty', () => {
        expect(isRelevantJob('', '')).toBe(false);
    });

    it('handles very long title (500+ chars)', () => {
        const longTitle = 'Psychiatric Mental Health Nurse Practitioner ' + 'A'.repeat(500);
        expect(isRelevantJob(longTitle, 'psych')).toBe(true);
    });

    it('handles unicode characters in title', () => {
        expect(isRelevantJob('PMHNP — Psychiatric Nurse Practitioner™', 'psych role')).toBe(true);
    });

    it('handles title with ONLY negative keyword (no positive match)', () => {
        expect(isRelevantJob('Medical Coding Specialist', 'coding and billing for healthcare')).toBe(false);
    });

    it('handles title where negative keyword is substring of valid word', () => {
        // "coding" should not match inside "psychiatric coding guidelines"
        expect(isRelevantJob('Psychiatric NP', 'familiar with psychiatric coding guidelines')).toBe(true);
    });

    it('passes "Licensed Psychiatric NP"', () => {
        expect(isRelevantJob('Licensed Psychiatric NP', 'psychiatric care')).toBe(true);
    });

    it('passes case-insensitive "pmhnp"', () => {
        expect(isRelevantJob('pmhnp opening', 'job opening')).toBe(true);
    });

    it('passes case-insensitive "PMHNP"', () => {
        expect(isRelevantJob('PMHNP Opening', 'job opening')).toBe(true);
    });

    it('blocks veterinary nurse practitioner', () => {
        expect(isRelevantJob('Veterinary Nurse Practitioner', 'animal care clinic')).toBe(false);
    });

    it('blocks medical assistant roles', () => {
        expect(isRelevantJob('Medical Assistant', 'clinical support staff')).toBe(false);
    });

    it('handles title with both positive and negative keywords', () => {
        // "PMHNP" is positive, but if title also has "Medical Assistant" it should still pass because PMHNP is strong
        expect(isRelevantJob('PMHNP / Medical Assistant supervisor', 'psychiatric care')).toBe(true);
    });
});
