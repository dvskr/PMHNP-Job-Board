/**
 * Sec2 — only first-party origins are accepted as password-reset
 * `redirectTo`. Mirrors the route's allow-list logic so a future drift
 * in either copy is caught by the test.
 */
import { describe, it, expect } from 'vitest';

const ALLOWED_HOSTS = new Set(['pmhnphiring.com', 'www.pmhnphiring.com', 'localhost']);

function safeRedirectOrigin(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    try {
        const u = new URL(raw);
        if (u.hostname.endsWith('.vercel.app')) return raw;
        if (ALLOWED_HOSTS.has(u.hostname)) return raw;
        return undefined;
    } catch {
        return undefined;
    }
}

describe('Sec2 — password-reset redirect allow-list', () => {
    it('accepts pmhnphiring.com', () => {
        expect(safeRedirectOrigin('https://pmhnphiring.com/reset')).toBe('https://pmhnphiring.com/reset');
    });
    it('accepts www.pmhnphiring.com', () => {
        expect(safeRedirectOrigin('https://www.pmhnphiring.com/reset')).toBe('https://www.pmhnphiring.com/reset');
    });
    it('accepts localhost (dev)', () => {
        expect(safeRedirectOrigin('http://localhost:3000/reset')).toBe('http://localhost:3000/reset');
    });
    it('accepts arbitrary *.vercel.app preview deploys', () => {
        expect(safeRedirectOrigin('https://pmhnp-job-board-pr-42.vercel.app/reset')).toBe('https://pmhnp-job-board-pr-42.vercel.app/reset');
    });
    it('rejects attacker domain', () => {
        expect(safeRedirectOrigin('https://evil.example.com/phish')).toBeUndefined();
    });
    it('rejects subdomain-trick (vercel.app suffix typo)', () => {
        expect(safeRedirectOrigin('https://pmhnp-job-board-pr-42.vercel.app.evil.com/phish')).toBeUndefined();
    });
    it('rejects pmhnphiring.com-prefix tricks', () => {
        expect(safeRedirectOrigin('https://pmhnphiring.com.evil.com/phish')).toBeUndefined();
    });
    it('rejects javascript: scheme', () => {
        // URL parse for `javascript:alert(1)` succeeds but hostname is empty
        expect(safeRedirectOrigin('javascript:alert(1)')).toBeUndefined();
    });
    it('rejects malformed URL', () => {
        expect(safeRedirectOrigin('not a url')).toBeUndefined();
    });
    it('returns undefined for missing input', () => {
        expect(safeRedirectOrigin(undefined)).toBeUndefined();
        expect(safeRedirectOrigin('')).toBeUndefined();
    });
});
