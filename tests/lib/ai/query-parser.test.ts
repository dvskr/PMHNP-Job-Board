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

    describe('salary-floor extraction', () => {
        it.each([
            ['telepsych over $140k', 140000],
            ['$140k+ PMHNP roles', 140000],
            ['at least $140,000 outpatient', 140000],
            ['psych 140k minimum', 140000],
            ['inpatient salary over 140k', 140000],
            ['making $200k telepsych', 200000],
        ])('extracts an annual floor from "%s"', (q, expected) => {
            const r = parseSemanticQuery(q);
            expect(r.minSalary).toBe(expected);
            expect(r.cleaned).not.toMatch(/\d/);
        });

        it('does not invent a floor when no salary amount is mentioned', () => {
            expect(parseSemanticQuery('no salary mentioned here').minSalary).toBeUndefined();
        });

        it('does not treat a sign-on bonus amount as a salary floor', () => {
            expect(parseSemanticQuery('PMHNP with $140k sign-on bonus').minSalary).toBeUndefined();
            expect(parseSemanticQuery('salary $140k sign-on bonus').minSalary).toBeUndefined();
        });

        it('does not treat a signing bonus amount as a salary floor', () => {
            expect(parseSemanticQuery('over $140k signing bonus').minSalary).toBeUndefined();
            expect(parseSemanticQuery('over $45k signing bonus').minSalary).toBeUndefined();
        });

        it('ignores hourly rates (annual amounts only)', () => {
            expect(parseSemanticQuery('over $95/hr telepsych').minSalary).toBeUndefined();
            expect(parseSemanticQuery('paying $85 per hour').minSalary).toBeUndefined();
        });

        it('ignores a bare amount with no salary cue nearby', () => {
            expect(parseSemanticQuery('PMHNP 140k').minSalary).toBeUndefined();
        });

        it('ignores "k" amounts too small to be annual salaries', () => {
            expect(parseSemanticQuery('over 30k').minSalary).toBeUndefined();
        });

        it('does not read "401k" as a $401,000 floor', () => {
            expect(parseSemanticQuery('salary 401k match benefits').minSalary).toBeUndefined();
        });

        it('a 401k mention does not block a real floor later in the query', () => {
            expect(parseSemanticQuery('jobs with 401k + PTO, $150k+').minSalary).toBe(150000);
        });

        it('strips a salary range wholesale and floors at the low end', () => {
            const r = parseSemanticQuery('telepsych salary $120k-$140k');
            expect(r.minSalary).toBe(120000);
            // No "-$140k" residue may leak into the embedded query.
            expect(r.cleaned).not.toMatch(/140/);
        });
    });

    describe('new-grad extraction', () => {
        it.each([
            'new grad PMHNP',
            'new-grad openings',
            'new graduate psychiatric NP',
            'newly graduated PMHNP',
            'entry level PMHNP',
            'entry-level telepsych',
        ])('flags "%s" as new grad and strips the token', (q) => {
            const r = parseSemanticQuery(q);
            expect(r.newGrad).toBe(true);
            expect(r.cleaned.toLowerCase()).not.toMatch(/new[- ]grad|newly graduated|entry[- ]level/);
        });

        it('does NOT flag "new to telehealth" as new grad', () => {
            const r = parseSemanticQuery('PMHNP new to telehealth');
            expect(r.newGrad).toBeUndefined();
            expect(r.cleaned.toLowerCase()).toContain('telehealth');
        });

        it('keeps working alongside a state name that begins with New', () => {
            const r = parseSemanticQuery('new grad PMHNP in New Jersey');
            expect(r.state).toBe('NJ');
            expect(r.newGrad).toBe(true);
        });
    });

    describe('combined extraction', () => {
        it('extracts every constraint from the audit query', () => {
            const r = parseSemanticQuery('remote new grad PMHNP licensed in Texas salary over $140k');
            expect(r.state).toBe('TX');
            expect(r.remoteOnly).toBe(true);
            expect(r.newGrad).toBe(true);
            expect(r.minSalary).toBe(140000);
            // Cleaned query keeps only the semantic intent.
            expect(r.cleaned.toLowerCase()).not.toMatch(/texas|remote|grad|salary|over|140/);
            expect(r.cleaned.toLowerCase()).toContain('pmhnp');
        });

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
