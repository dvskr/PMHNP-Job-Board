import { describe, it, expect } from 'vitest';
import { formatCT, ctDayBounds } from '@/lib/format-ct';

describe('formatCT', () => {
    it('returns "—" for null/undefined', () => {
        expect(formatCT(null)).toBe('—');
        expect(formatCT(undefined)).toBe('—');
    });

    it('returns "—" for invalid date', () => {
        expect(formatCT('not-a-date')).toBe('—');
        expect(formatCT(new Date('garbage'))).toBe('—');
    });

    it('appends " CT" suffix in datetime mode', () => {
        const out = formatCT(new Date('2026-05-06T18:00:00Z'));
        expect(out).toMatch(/ CT$/);
    });

    it('renders 18:00 UTC as 1:00 PM CT (CDT)', () => {
        // May = CDT (UTC−5). Intl uses U+202F (narrow no-break space)
        // before AM/PM in modern Node, so use \s rather than literal space.
        const out = formatCT(new Date('2026-05-06T18:00:00Z'));
        expect(out).toMatch(/1:00\s*PM/i);
    });

    it('renders 18:00 UTC as 12:00 PM CT in winter (CST)', () => {
        // January = CST (UTC−6)
        const out = formatCT(new Date('2026-01-15T18:00:00Z'));
        expect(out).toMatch(/12:00\s*PM/i);
    });

    it('date mode emits month + day + year', () => {
        const out = formatCT(new Date('2026-05-06T18:00:00Z'), 'date');
        expect(out).toContain('May');
        expect(out).toContain('06');
        expect(out).toContain('2026');
        expect(out).toMatch(/ CT$/);
    });

    it('time mode emits hour:min only', () => {
        const out = formatCT(new Date('2026-05-06T18:00:00Z'), 'time');
        expect(out).not.toContain('May');
        expect(out).toMatch(/1:00/);
        expect(out).toMatch(/PM/i);
    });

    it('accepts ISO string input', () => {
        const out = formatCT('2026-05-06T18:00:00Z');
        expect(out).toMatch(/ CT$/);
    });
});

describe('ctDayBounds', () => {
    it('returns a 24-hour window', () => {
        const { startUtc, endUtc } = ctDayBounds(new Date('2026-05-06T18:00:00Z'));
        expect(endUtc.getTime() - startUtc.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    it('start is CT-midnight rendered in UTC for May (CDT, UTC−5)', () => {
        // 2026-05-06 18:00 UTC → CT is 2026-05-06 13:00 CDT
        // CT-midnight = 2026-05-06 00:00 CDT = 2026-05-06 05:00 UTC
        const { startUtc } = ctDayBounds(new Date('2026-05-06T18:00:00Z'));
        expect(startUtc.toISOString()).toBe('2026-05-06T05:00:00.000Z');
    });

    it('start is CT-midnight rendered in UTC for January (CST, UTC−6)', () => {
        // 2026-01-15 18:00 UTC → CT is 2026-01-15 12:00 CST
        // CT-midnight = 2026-01-15 00:00 CST = 2026-01-15 06:00 UTC
        const { startUtc } = ctDayBounds(new Date('2026-01-15T18:00:00Z'));
        expect(startUtc.toISOString()).toBe('2026-01-15T06:00:00.000Z');
    });

    it('handles "after midnight UTC, still yesterday in CT" correctly', () => {
        // 2026-05-06 03:00 UTC → CT is 2026-05-05 22:00 CDT (still May 5 in CT)
        // CT-midnight of May 5 = 2026-05-05 05:00 UTC
        const { startUtc, endUtc } = ctDayBounds(new Date('2026-05-06T03:00:00Z'));
        expect(startUtc.toISOString()).toBe('2026-05-05T05:00:00.000Z');
        expect(endUtc.toISOString()).toBe('2026-05-06T05:00:00.000Z');
    });
});
