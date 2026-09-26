/**
 * CSRF Protection — Origin Header Verification
 *
 * Verifies that mutation requests (POST/PUT/PATCH/DELETE) originate
 * from our own domain by checking the Origin or Referer header.
 * This blocks cross-site form submissions and fetch() attacks.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FIRST_PARTY_ORIGINS } from '@/lib/origins';

/**
 * Call at the top of any state-changing API handler (POST/PUT/PATCH/DELETE).
 * Returns null if the request is safe, or a 403 Response if CSRF is detected.
 *
 * Skips checking for:
 * - Requests with Bearer tokens (API/extension calls)
 * - Webhook endpoints (Stripe, etc.) — they have their own signature verification
 */
/**
 * True when the caller's origin is the very host it is calling.
 *
 * This is the actual CSRF question, and the allowlist alone cannot answer it.
 * A Vercel preview deployment serves its own pages from a hostname nobody
 * added to FIRST_PARTY_ORIGINS, so every mutation from that deployment's own
 * UI looks foreign. An attacker cannot forge this: a page on another site
 * cannot make the browser send an Origin equal to our host.
 */
function isSameOrigin(request: NextRequest, candidate: string): boolean {
    try {
        const host = request.headers.get('host');
        if (!host) return false;
        return new URL(candidate).host === host;
    } catch {
        return false;
    }
}

function isTrusted(request: NextRequest, origin: string): boolean {
    return FIRST_PARTY_ORIGINS.includes(origin) || isSameOrigin(request, origin);
}

const FORBIDDEN = () =>
    NextResponse.json({ error: 'Forbidden: cross-origin request blocked' }, { status: 403 });

export function verifyCsrf(request: NextRequest): NextResponse | null {
    // Skip for non-browser clients (Bearer auth = API/extension)
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        return null;
    }

    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');

    // If neither header is present, the request likely came from a non-browser client
    // (e.g., Postman, curl, server-to-server). Allow these for now as they
    // can't carry session cookies anyway (SameSite protection).
    if (!origin && !referer) {
        return null;
    }

    // Check Origin header first (more reliable)
    if (origin) {
        return isTrusted(request, origin) ? null : FORBIDDEN();
    }

    // Fall back to Referer header
    if (referer) {
        try {
            return isTrusted(request, new URL(referer).origin) ? null : FORBIDDEN();
        } catch {
            return FORBIDDEN(); // malformed referer
        }
    }

    return null;
}

/** Methods that can change state, and so need an origin check. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Endpoints that must never get an origin check, because for them a browser
 * Origin is either absent by design or beside the point.
 *
 * Each entry is a decision, not a convenience:
 *  - webhooks authenticate with a provider signature, and the provider is a
 *    server that sends no Origin;
 *  - cron routes authenticate with CRON_SECRET;
 *  - the RFC 8058 opt-out endpoints are POSTed directly by Gmail and Yahoo
 *    with no human and no Origin. Refusing those would be a deliverability
 *    penalty on exactly the control that must always work;
 *  - the token routes carry their credential in the URL, so there is no
 *    ambient authority for another origin to borrow.
 */
const CSRF_EXEMPT_PREFIXES = [
    '/api/webhooks/',
    '/api/cron/',
    '/api/one-click-unsubscribe',
    '/api/email/unsubscribe',
    '/api/email/preferences',
    '/api/job-alerts',
];

export function isCsrfExemptPath(pathname: string): boolean {
    return CSRF_EXEMPT_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`),
    );
}

/**
 * The namespace-wide check, called once from middleware.
 *
 * Wiring verifyCsrf route by route left 83 mutating handlers unguarded,
 * including every admin write, and each audit only ever reached the handful
 * of routes it happened to look at. Enforcing it here covers the namespace,
 * and the per-route calls that remain are harmless belt and braces.
 *
 * Returns a 403 to send back, or null to continue.
 */
export function enforceApiCsrf(request: NextRequest, pathname: string): NextResponse | null {
    if (!pathname.startsWith('/api/')) return null;
    if (!MUTATING_METHODS.has(request.method)) return null;
    if (isCsrfExemptPath(pathname)) return null;
    return verifyCsrf(request);
}
