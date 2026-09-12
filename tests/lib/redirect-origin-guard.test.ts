/**
 * The auth redirect allow-list, tested against the real implementation.
 *
 * This file used to hold a hand-copied mirror of the route's logic, which is
 * how it ended up asserting "accepts arbitrary *.vercel.app preview deploys"
 * long after that had been identified as an open redirect: the copy could not
 * drift into failure because nothing it tested was shipped. It now imports
 * lib/auth/redirect-origin-guard.ts directly.
 *
 * The invariant: a host is first-party only if it is one of our own domains or
 * one this deployment's env says is itself. `*.vercel.app` project names are
 * registrable by anyone, prefix included, so no suffix or prefix test may pass.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { safeAuthRedirect, allowedRedirectHosts } from '@/lib/auth/redirect-origin-guard';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('safeAuthRedirect', () => {
    it.each([
        'https://pmhnphiring.com/reset-password',
        'https://www.pmhnphiring.com/reset-password',
        'https://dev.pmhnphiring.com/reset-password',
        'http://localhost:3000/reset-password',
        'http://127.0.0.1:3000/reset-password',
    ])('accepts first-party target %s', (url) => {
        expect(safeAuthRedirect(url)).toBe(url);
    });

    it.each([
        // Third-party-claimable Vercel project names, prefixed and not. Every
        // one of these passed the old prefix heuristic or the older suffix one.
        'https://pmhnp-job-board-evil.vercel.app/steal',
        'https://pmhnp-job-board-reset.vercel.app/steal',
        'https://pmhnp-job-board.vercel.app/steal',
        'https://attacker-phish.vercel.app/steal',
        'https://pmhnphiring.vercel.app/steal',
        'https://reset-pmhnp-job-board.vercel.app/steal',
        // Plain off-site targets and suffix tricks.
        'https://evil.example/steal',
        'https://pmhnphiring.com.evil.example/steal',
        'https://notpmhnphiring.com/steal',
        'https://pmhnp-job-board-pr-42.vercel.app.evil.example/steal',
        // Scheme downgrade on a real host, and non-http schemes.
        'http://pmhnphiring.com/reset-password',
        'javascript:alert(1)',
        // Not absolute URLs at all.
        '/reset-password',
        'not a url',
        '',
    ])('rejects untrusted target %s', (url) => {
        expect(safeAuthRedirect(url)).toBeUndefined();
    });

    it('passes null and undefined through so the provider default is used', () => {
        expect(safeAuthRedirect(undefined)).toBeUndefined();
        expect(safeAuthRedirect(null)).toBeUndefined();
    });

    it('accepts this deployment own preview host from VERCEL_URL', () => {
        const host = 'pmhnp-job-board-abc123-team.vercel.app';
        expect(safeAuthRedirect(`https://${host}/reset-password`)).toBeUndefined();
        vi.stubEnv('VERCEL_URL', host);
        expect(safeAuthRedirect(`https://${host}/reset-password`)).toBe(`https://${host}/reset-password`);
        // A sibling preview name is still not this deployment.
        expect(safeAuthRedirect('https://pmhnp-job-board-other-team.vercel.app/x')).toBeUndefined();
    });

    it('accepts the git-branch alias from VERCEL_BRANCH_URL', () => {
        const host = 'pmhnp-job-board-git-fix-login-team.vercel.app';
        vi.stubEnv('VERCEL_BRANCH_URL', host);
        expect(safeAuthRedirect(`https://${host}/reset-password`)).toBe(`https://${host}/reset-password`);
    });

    it('reads env per call so a host added after import is honoured', () => {
        expect(allowedRedirectHosts().has('preview-fic.example')).toBe(false);
        vi.stubEnv('VERCEL_BRANCH_URL', 'preview-fic.example');
        expect(allowedRedirectHosts().has('preview-fic.example')).toBe(true);
    });

    it('ignores a malformed env host instead of widening the list', () => {
        vi.stubEnv('VERCEL_URL', ':::not a host:::');
        expect(safeAuthRedirect('https://pmhnphiring.com/reset-password')).toBe('https://pmhnphiring.com/reset-password');
        expect(safeAuthRedirect('https://evil.example/steal')).toBeUndefined();
    });
});
