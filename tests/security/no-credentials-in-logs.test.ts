/**
 * Sign-in credentials must never reach the logs.
 *
 * Found 2026-09-02 by the edge-to-edge hunt: /api/auth/send-confirmation logged
 * the Supabase magic link on every signup
 * (`logger.info('Generated confirmation link', { email, url })`), and its error
 * branch logged the whole generateLink response, which carries the same link
 * plus the hashed OTP. Following that URL authenticates as the user, so anyone
 * with log access (Vercel logs, a drain, Sentry, a support screenshot) could
 * take over any account that had just signed up.
 *
 * This is a static guard: it reads the real sources so the pattern cannot come
 * back in a later edit.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * Log calls that pass a whole-credential VALUE. These match property access or
 * an assigned identifier, never the message text, so
 * `logger.error('No action_link in response')` stays legal while
 * `logger.info('...', { url: data.properties.action_link })` does not.
 */
const CREDENTIAL_IN_LOG = [
    /logger\.\w+\([^)]*\.action_link/,
    /logger\.\w+\([^)]*:\s*actionLink\b/,
    /logger\.\w+\([^)]*:\s*confirmationUrl\b/,
    /console\.\w+\([^)]*\.action_link/,
    /console\.\w+\([^)]*\bconfirmationUrl\b/,
];

describe('/api/auth/send-confirmation', () => {
    const src = read('app/api/auth/send-confirmation/route.ts');

    it('does not log the magic link', () => {
        for (const pattern of CREDENTIAL_IN_LOG) {
            expect(src, `matched ${pattern}`).not.toMatch(pattern);
        }
    });

    it('does not log the raw generateLink response object', () => {
        expect(src).not.toMatch(/logger\.error\(\s*'No action_link in generateLink response',\s*data\s*\)/);
    });

    it('still records that a link was issued', () => {
        expect(src).toMatch(/logger\.info\('Generated confirmation link'/);
    });
});

describe('auth routes generally', () => {
    const AUTH_ROUTES = [
        'app/api/auth/send-confirmation/route.ts',
        'app/api/auth/forgot-password/route.ts',
        'app/auth/callback/route.ts',
        'app/api/auth/extension-token/route.ts',
    ].filter((rel) => fs.existsSync(path.join(ROOT, rel)));

    it('log no whole-credential values', () => {
        const hits: string[] = [];
        for (const rel of AUTH_ROUTES) {
            const src = read(rel);
            for (const pattern of CREDENTIAL_IN_LOG) {
                if (pattern.test(src)) hits.push(`${rel} matches ${pattern}`);
            }
        }
        expect(hits).toEqual([]);
    });
});
