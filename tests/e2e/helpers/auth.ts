/**
 * Re-export the existing auth helpers under the Sprint 0.5.4 path so future
 * AI-feature E2E tests can import from the canonical location:
 *
 *   import { playwrightAuth } from '../helpers/auth';
 *
 * (The real implementations live in tests/e2e/fixtures/auth.ts, which has
 * shipped for a while. This module is a stable, renamed surface so the
 * cookbook in docs/ai-testing-guide.md doesn't have to talk about fixtures
 * vs helpers.)
 */

import type { Page } from '@playwright/test';
import {
    getSeekerCreds,
    getEmployerCreds,
    getAdminCreds,
} from '../fixtures/auth';

export type Role = 'candidate' | 'employer' | 'admin';

export interface AuthOptions {
    /** Where to navigate after login. Defaults to '/'. */
    landingPath?: string;
}

/**
 * Sign in as the requested role. Throws if the role's E2E credentials env
 * vars aren't set — fail loud rather than silently no-op.
 *
 * Recognized env pairs (set in CI or .env.local):
 *   - candidate: E2E_SEEKER_EMAIL    + E2E_SEEKER_PASS
 *   - employer:  E2E_EMPLOYER_EMAIL  + E2E_EMPLOYER_PASS
 *   - admin:     E2E_ADMIN_EMAIL     + E2E_ADMIN_PASS
 */
export async function playwrightAuth(page: Page, role: Role, options: AuthOptions = {}): Promise<void> {
    const creds =
        role === 'candidate' ? getSeekerCreds() :
        role === 'employer'  ? getEmployerCreds() :
                                getAdminCreds();

    if (!creds) {
        throw new Error(
            `playwrightAuth(${role}): missing E2E credentials env vars. Set the appropriate ` +
            `E2E_<ROLE>_EMAIL and E2E_<ROLE>_PASS to run this test.`,
        );
    }

    await page.goto('/auth/login');
    await page.fill('input[type="email"]', creds.email);
    await page.fill('input[type="password"]', creds.password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith('/auth/login'));

    if (options.landingPath) {
        await page.goto(options.landingPath);
    }
}
