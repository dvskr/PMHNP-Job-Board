/**
 * First-Party Origin Allowlist — Single Source of Truth
 *
 * Consumed by BOTH lib/csrf.ts (CSRF origin check) and middleware.ts
 * (CORS allowlist). Keep the two in sync by editing ONLY this file.
 *
 * Middleware runs on the edge runtime, so this module must stay
 * dependency-free and edge-safe — import nothing but process.env.
 */

export const FIRST_PARTY_ORIGINS: readonly string[] = [
    'https://pmhnphiring.com',
    'https://www.pmhnphiring.com',
    'https://dev.pmhnphiring.com',
    process.env.NEXT_PUBLIC_BASE_URL,
    'http://localhost:3000',
    'http://localhost:3001',
].filter(Boolean) as string[];
