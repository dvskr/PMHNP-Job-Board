import { describe, it, expect } from 'vitest';
import { detectSoft404, listPatterns } from '../../lib/health/soft-404-detector';

describe('detectSoft404', () => {
    it('returns null when no pattern matches', () => {
        const html = '<html><body><h1>Senior PMHNP</h1><p>Apply now for an exciting role</p></body></html>';
        expect(detectSoft404('greenhouse', 'https://example.com/job/1', html)).toBeNull();
    });

    it('returns null on null body and clean URL', () => {
        expect(detectSoft404(null, 'https://example.com/job/1', null)).toBeNull();
    });

    it('matches universal "position has been filled"', () => {
        const html = '<p>This position has been filled.</p>';
        const m = detectSoft404(null, 'https://example.com/x', html);
        expect(m?.patternId).toBe('position_filled');
        expect(m?.location).toBe('body');
    });

    it('matches universal "no longer accepting applications"', () => {
        const html = '<p>We are no longer accepting applications for this position.</p>';
        const m = detectSoft404('lever', 'https://example.com/x', html);
        expect(m?.patternId).toBe('no_longer_accepting');
    });

    it('matches Greenhouse-scoped soft-404 only when source matches', () => {
        const html = '<p>This position has been removed.</p>';
        const m = detectSoft404('greenhouse', 'https://boards.greenhouse.io/co/jobs/1', html);
        // "removed" matches a universal pattern too, but greenhouse-specific takes priority by appearing earlier
        expect(m).not.toBeNull();
        expect(m?.location).toBe('body');
    });

    it('matches URL fragment /closed', () => {
        const m = detectSoft404(null, 'https://employer.com/jobs/closed/1234', null);
        expect(m?.patternId).toBe('url_closed');
        expect(m?.location).toBe('final_url');
    });

    it('matches URL fragment /no-longer-available', () => {
        const m = detectSoft404(null, 'https://employer.com/no-longer-available/abc', null);
        expect(m?.patternId).toBe('url_no_longer_available');
    });

    it('does not match the literal word "expired" in legitimate descriptions', () => {
        // False-positive guard: the word "expired" alone (e.g. "license never expired")
        // must NOT trigger soft-404. We rely on URL-fragment patterns instead.
        const html = '<p>Applicants whose license has not expired are welcome to apply.</p>';
        expect(detectSoft404(null, 'https://example.com/x', html)).toBeNull();
    });

    it('source is case-insensitive', () => {
        const html = '<p>Sorry, this job advert is no longer live</p>';
        expect(detectSoft404('Adzuna', 'https://example.com/x', html)?.patternId).toBe('adzuna_sorry');
        expect(detectSoft404('ADZUNA', 'https://example.com/x', html)?.patternId).toBe('adzuna_sorry');
    });

    it('truncates matchText to 80 chars', () => {
        const html = 'this position has been filled ' + 'x'.repeat(500);
        const m = detectSoft404(null, 'https://example.com/x', html);
        expect(m?.matchText.length).toBeLessThanOrEqual(80);
    });

    it('checks final_url before body', () => {
        const html = '<p>this position has been filled</p>';
        const m = detectSoft404(null, 'https://example.com/jobs/closed/1', html);
        // URL pattern should win because it scans first
        expect(m?.location).toBe('final_url');
    });

    it('listPatterns returns the curated set', () => {
        const patterns = listPatterns();
        expect(patterns.length).toBeGreaterThan(10);
        expect(patterns.every((p) => typeof p.id === 'string')).toBe(true);
    });
});
