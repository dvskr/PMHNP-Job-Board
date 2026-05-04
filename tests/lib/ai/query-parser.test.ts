/**
 * Tests for the natural-language query parser used by /api/jobs/search/semantic.
 * The route depends on it to extract state + remote intent — silent regressions
 * here directly degrade search quality.
 */

import { describe, it, expect } from 'vitest';
import { parseSemanticQuery } from '@/lib/ai/query-parser';

describe('parseSemanticQuery', () => {
    describe('state extraction', () => {
        it('extracts a 2-letter code in "in CA"', () => {
            const r = parseSemanticQuery('telehealth child psych in CA');
            expect(r.state).toBe('CA');
            expect(r.cleaned).not.toMatch(/\bca\b/i);
            expect(r.cleaned).not.toMatch(/\bin\b/i);
        });

        it('extracts a full state name', () => {
            const r = parseSemanticQuery('PMHNP jobs in California');
            expect(r.state).toBe('CA');
            expect(r.cleaned.toLowerCase()).not.toContain('california');
        });

        it('extracts state name from end of query', () => {
            const r = parseSemanticQuery('telehealth Texas');
            expect(r.state).toBe('TX');
        });

        it('handles multi-word state names (New York)', () => {
            const r = parseSemanticQuery('inpatient psychiatry in New York');
            expect(r.state).toBe('NY');
            expect(r.cleaned.toLowerCase()).not.toContain('new york');
        });

        it('disambiguates Washington state from Washington DC', () => {
            const dc = parseSemanticQuery('PMHNP in Washington DC');
            expect(dc.state).toBe('DC');
            const wa = parseSemanticQuery('PMHNP in Washington state');
            expect(wa.state).toBe('WA');
        });

        it('does NOT match a 2-letter code embedded in a longer word', () => {
            // "CAN" should not be parsed as "CA" + "N".
            const r = parseSemanticQuery('CAN you find PMHNP roles');
            expect(r.state).toBeUndefined();
        });

        it('returns undefined when no state is mentioned', () => {
            const r = parseSemanticQuery('telehealth child psych');
            expect(r.state).toBeUndefined();
        });
    });

    describe('remote extraction', () => {
        it('detects "remote"', () => {
            const r = parseSemanticQuery('remote PMHNP');
            expect(r.remoteOnly).toBe(true);
            expect(r.cleaned.toLowerCase()).not.toContain('remote');
        });

        it('detects "telework", "wfh", "virtual" as synonyms', () => {
            expect(parseSemanticQuery('telework PMHNP').remoteOnly).toBe(true);
            expect(parseSemanticQuery('wfh psychiatry').remoteOnly).toBe(true);
            expect(parseSemanticQuery('virtual PMHNP').remoteOnly).toBe(true);
        });

        it('does NOT flag "telehealth" as remote (it is a clinical setting, not a work mode)', () => {
            const r = parseSemanticQuery('telehealth psychiatry');
            expect(r.remoteOnly).toBeUndefined();
            expect(r.cleaned.toLowerCase()).toContain('telehealth');
        });
    });

    describe('combined extraction', () => {
        it('pulls state + remote out of a complex query', () => {
            const r = parseSemanticQuery('remote child psychiatry in California');
            expect(r.state).toBe('CA');
            expect(r.remoteOnly).toBe(true);
            // Cleaned query keeps the qualitative semantic content.
            expect(r.cleaned.toLowerCase()).toContain('child');
            expect(r.cleaned.toLowerCase()).toContain('psychiatry');
        });

        it('falls back to the original query when cleaning would empty it', () => {
            const r = parseSemanticQuery('California');
            expect(r.state).toBe('CA');
            // Cleaned is empty, so we fall back to the raw original.
            expect(r.cleaned).toBe('California');
        });
    });
});
