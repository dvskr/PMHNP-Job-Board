/**
 * The password-reset `redirectTo` allow-list.
 *
 * Supabase embeds this value in the reset email as `?next=`, so whatever the
 * allow-list admits is where a real user lands after completing a real reset.
 *
 * Found 2026-09-02 by the edge-to-edge hunt: the Sec2 fix (2026-06-01) closed
 * the open redirect for arbitrary hosts but kept `hostname.endsWith('.vercel.app')`
 * as a blanket pass for preview deploys. That suffix is third-party
 * registrable, so an attacker could deploy their own `*.vercel.app` page,
 * trigger a reset for someone else's address with `redirectTo` pointing at it,
 * and have the genuine email carry the victim there. Preview hosts must now
 * also match this project's deployment prefix.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { safeRedirectOrigin } from '@/app/api/auth/forgot-password/route';

describe('safeRedirectOrigin', () => {
    it.each([
        'https://pmhnphiring.com/reset-password',
        'https://www.pmhnphiring.com/reset-password',
        'https://dev.pmhnphiring.com/reset-password',
        'http://localhost:3000/reset-password',
        'https://pmhnp-job-board-abc123-team.vercel.app/reset-password',
    ])('accepts first-party target %s', (url) => {
        expect(safeRedirectOrigin(url)).toBe(url);
    });

    it.each([
        // The reopened hole: any third party can deploy these.
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

    it('never admits a bare vercel.app subdomain that lacks the project prefix', () => {
        // Property-style guard: the old check was `endsWith('.vercel.app')`.
        for (const host of ['a', 'phish', 'pmhnp', 'pmhnphiring', 'job-board']) {
            expect(safeRedirectOrigin(`https://${host}.vercel.app/x`)).toBeUndefined();
        }
    });
});
