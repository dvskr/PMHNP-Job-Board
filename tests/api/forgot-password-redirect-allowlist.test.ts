/**
 * The password-reset `redirectTo` allow-list.
 *
 * Supabase embeds this value in the reset email as `?next=`, so whatever the
 * allow-list admits is where a real user lands after completing a real reset.
 *
 * Found 2026-09-02 by the edge-to-edge hunt: the Sec2 fix (2026-06-01) closed
 * the open redirect for arbitrary hosts but kept `hostname.endsWith('.vercel.app')`
 * as a blanket pass for preview deploys. The follow-up narrowed that to hosts
 * starting with this project's name, which is not a fix: Vercel gives
 * `<project>.vercel.app` to whoever claims the project name first, in any
 * account, so `pmhnp-job-board-anything.vercel.app` was still registrable by a
 * stranger. The route now matches exact hosts from this deployment's own
 * env-derived origins (lib/auth/redirect-origin-guard.ts) and no prefix or
 * suffix heuristic survives.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { safeRedirectOrigin } from '@/app/api/auth/forgot-password/route';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('safeRedirectOrigin', () => {
    it.each([
        'https://pmhnphiring.com/reset-password',
        'https://www.pmhnphiring.com/reset-password',
        'https://dev.pmhnphiring.com/reset-password',
        'http://localhost:3000/reset-password',
    ])('accepts first-party target %s', (url) => {
        expect(safeRedirectOrigin(url)).toBe(url);
    });

    it('accepts a preview host only when this deployment says it is its own', () => {
        const url = 'https://pmhnp-job-board-abc123-team.vercel.app/reset-password';
        expect(safeRedirectOrigin(url)).toBeUndefined();
        vi.stubEnv('VERCEL_URL', 'pmhnp-job-board-abc123-team.vercel.app');
        expect(safeRedirectOrigin(url)).toBe(url);
    });

    it.each([
        // Prefixed Vercel project names: claimable by any account, so the
        // prefix heuristic that used to pass these is gone.
        'https://pmhnp-job-board-evil.vercel.app/steal',
        'https://pmhnp-job-board-login.vercel.app/steal',
        'https://pmhnp-job-board.vercel.app/steal',
        // The original blanket-suffix hole.
        'https://attacker-phish.vercel.app/steal',
        'https://pmhnphiring.vercel.app/steal',
        'https://reset-pmhnp-job-board.vercel.app/steal',
        // Plain off-site targets.
        'https://evil.example/steal',
        'https://pmhnphiring.com.evil.example/steal',
        'https://notpmhnphiring.com/steal',
        // Non-https schemes off localhost.
        'http://pmhnphiring.com/reset-password',
        // Not a URL at all.
        '/reset-password',
        'javascript:alert(1)',
        '',
    ])('rejects untrusted target %s', (url) => {
        expect(safeRedirectOrigin(url)).toBeUndefined();
    });

    it('passes undefined through so Supabase uses its configured default', () => {
        expect(safeRedirectOrigin(undefined)).toBeUndefined();
    });

    it('never admits a vercel.app host on name alone', () => {
        // Property-style guard: the old checks were `endsWith('.vercel.app')`
        // and then `startsWith('pmhnp-job-board-')`.
        for (const host of ['a', 'phish', 'pmhnp', 'pmhnphiring', 'job-board', 'pmhnp-job-board-x']) {
            expect(safeRedirectOrigin(`https://${host}.vercel.app/x`)).toBeUndefined();
        }
    });
});
