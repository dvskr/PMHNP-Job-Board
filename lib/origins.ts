/**
 * First-Party Origin Allowlist — Single Source of Truth
 *
 * Consumed by BOTH lib/csrf.ts (CSRF origin check) and middleware.ts
 * (CORS allowlist). Keep the two in sync by editing ONLY this file.
 *
 * Middleware runs on the edge runtime, so this module must stay
 * dependency-free and edge-safe — import nothing but process.env.
 */

/**
 * Local development origins.
 *
 * These used to ship unconditionally, which meant a PRODUCTION request whose
 * Origin was a page served from the victim's own machine on port 3000 or 3001
 * counted as first-party: verifyCsrf waved it through, and middleware echoed it
 * back in Access-Control-Allow-Origin. Gating on NODE_ENV keeps them out of the
 * production bundle entirely.
 *
 * A dev server on any other port (this repo commonly runs on 3100 to avoid a
 * collision with a sibling app) is admitted through NEXT_PUBLIC_BASE_URL below,
 * which is the knob that already exists for exactly that case.
 */
const LOCAL_DEV_ORIGINS =
    process.env.NODE_ENV === 'production'
        ? []
        : ['http://localhost:3000', 'http://localhost:3001'];

export const FIRST_PARTY_ORIGINS: readonly string[] = [
    'https://pmhnphiring.com',
    'https://www.pmhnphiring.com',
    'https://dev.pmhnphiring.com',
    process.env.NEXT_PUBLIC_BASE_URL,
    ...LOCAL_DEV_ORIGINS,
].filter(Boolean) as string[];
