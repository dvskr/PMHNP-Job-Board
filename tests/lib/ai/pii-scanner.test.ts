/**
 * Tests for the PII scanner findViolations() function. Doesn't run the CLI —
 * just validates the detection logic.
 */

import { describe, it, expect } from 'vitest';
import { __testing } from '@/scripts/scan-prompt-pii';

describe('PII scanner', () => {
    it('flags forbidden field references (case-insensitive)', () => {
        const violations = __testing.findViolations('test.json', 'system', 'Include the candidate deaNumber if present.');
        expect(violations.some((v) => v.pattern === 'field:deaNumber')).toBe(true);
    });

    it('flags raw 10-digit NPI numbers in the prompt body', () => {
        const violations = __testing.findViolations('test.json', 'user_template', 'Their identifier is 1234567890 — please review.');
        expect(violations.some((v) => v.pattern.includes('NPI'))).toBe(true);
    });

    it('flags DEA-shaped strings (XX9999999)', () => {
        const violations = __testing.findViolations('test.json', 'system', 'DEA AB1234567 must be checked.');
        expect(violations.some((v) => v.pattern.includes('DEA'))).toBe(true);
    });

    it('flags SSN-shaped strings', () => {
        const violations = __testing.findViolations('test.json', 'system', 'SSN 123-45-6789 should never appear here.');
        expect(violations.some((v) => v.pattern.includes('SSN'))).toBe(true);
    });

    it('flags demographic field references (race, ethnicity, gender)', () => {
        const violations = __testing.findViolations('test.json', 'system', 'Score uses race and ethnicity.');
        expect(violations.some((v) => v.pattern === 'field:race')).toBe(true);
        expect(violations.some((v) => v.pattern === 'field:ethnicity')).toBe(true);
    });

    it('does NOT flag clean prompt content', () => {
        const violations = __testing.findViolations('test.json', 'system', 'Score the candidate based on certifications and license states.');
        expect(violations).toEqual([]);
    });
});
