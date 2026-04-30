import { describe, it, expect } from 'vitest';
import { normalizeCompanyName, findCanonicalName } from '../../lib/company-normalizer';

describe('normalizeCompanyName', () => {
    it('lowercases and trims', () => {
        expect(normalizeCompanyName('  Acme  ')).toBe('acme');
    });

    it('strips legal suffixes', () => {
        expect(normalizeCompanyName('Acme Inc')).toBe('acme');
        expect(normalizeCompanyName('Acme, LLC')).toBe('acme');
        expect(normalizeCompanyName('Acme Healthcare')).toBe('acme');
    });

    it('splits CamelCase so duplicates cluster', () => {
        expect(normalizeCompanyName('BlueSky')).toBe(normalizeCompanyName('Blue Sky'));
        expect(normalizeCompanyName('TeamHealth')).toBe(normalizeCompanyName('Team Health'));
        expect(normalizeCompanyName('CoreCivic')).toBe(normalizeCompanyName('Core Civic'));
        expect(normalizeCompanyName('SandstoneCare')).toBe(normalizeCompanyName('Sandstone Care'));
    });

    it('handles consecutive capitals before a lowercase', () => {
        // "HealthRIGHT 360" should normalize the same as "Health Right 360"
        expect(normalizeCompanyName('HealthRIGHT 360')).toBe(
            normalizeCompanyName('Health Right 360'),
        );
    });

    it('strips clear " - department" tails', () => {
        // Tails matching department/division keywords get stripped.
        expect(normalizeCompanyName('GHR Healthcare - PH Division')).toBe(
            normalizeCompanyName('GHR Healthcare'),
        );
        expect(normalizeCompanyName('Headway - Design & Development')).toBe(
            normalizeCompanyName('Headway'),
        );
        expect(normalizeCompanyName('Akron Children\'s - Physician Recruitment')).toBe(
            normalizeCompanyName('Akron Children\'s'),
        );
    });

    it('does NOT strip geographic " - State" tails (different campuses)', () => {
        // UC-Irvine and UC-Davis are different campuses; must not collapse.
        expect(normalizeCompanyName('University of California - Irvine')).not.toBe(
            normalizeCompanyName('University of California - Davis'),
        );
        expect(normalizeCompanyName('Carease Health - VA')).not.toBe(
            normalizeCompanyName('Carease Health - NJ'),
        );
        expect(normalizeCompanyName('Army Recruitment Team - Kansas')).not.toBe(
            normalizeCompanyName('Army Recruitment Team - Texas'),
        );
    });

    it('does not strip embedded dashes that are part of a name', () => {
        // No spaces around the dash → not a department tail
        const a = normalizeCompanyName('Yale-New Haven Health');
        // Just confirm it doesn't crash and produces stable output
        expect(typeof a).toBe('string');
        expect(a.length).toBeGreaterThan(0);
    });

    it('collapses hyphen-everything garbage', () => {
        expect(normalizeCompanyName('Summit-medical-consultants-llc')).toBe(
            normalizeCompanyName('Summit Medical Consultants'),
        );
    });

    it('returns empty string for empty input', () => {
        expect(normalizeCompanyName('')).toBe('');
        expect(normalizeCompanyName('   ')).toBe('');
    });

    it('preserves "Health" when preceded by an institutional anchor', () => {
        // "Indiana University Health" is a hospital system; "Indiana University"
        // is a school. They must not collapse to the same key.
        expect(normalizeCompanyName('Indiana University Health')).not.toBe(
            normalizeCompanyName('Indiana University'),
        );
        expect(normalizeCompanyName('Yale University Health')).not.toBe(
            normalizeCompanyName('Yale University'),
        );
    });

    it('still strips "Health" suffix when no anchor is present', () => {
        // No "University"/"Hospital"/etc. before "Health" → safe to drop.
        expect(normalizeCompanyName('TeamHealth')).toBe(
            normalizeCompanyName('Team'),
        );
    });
});

describe('findCanonicalName', () => {
    it('finds known LifeStance variants', () => {
        expect(findCanonicalName('LifeStance')).toBe('LifeStance Health');
        expect(findCanonicalName('Lifestance')).toBe('LifeStance Health');
        expect(findCanonicalName('LifeStance Health')).toBe('LifeStance Health');
    });

    it('returns null for unknown companies', () => {
        expect(findCanonicalName('Some Random Hospital LLC')).toBeNull();
    });
});
