import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { resolveClickDestination } from '@/lib/email/email-click-allowlist';

/**
 * GET /api/track/email-click?t=<opaque token>&d=<relative destination>
 *
 * Click tracker for match-digest emails. Stamps MatchDigestEmail.clickedAt
 * on the FIRST hit for the token, then 302s into the platform.
 *
 * Design rules:
 *   - `d` is validated against a strict allowlist of relative paths
 *     (lib/email/email-click-allowlist.ts). Anything else falls back to the
 *     default employer candidates page — this route can never open-redirect.
 *   - The redirect ALWAYS happens, even for unknown/expired tokens, rate
 *     limits, or a DB failure. An email click must never strand the user on
 *     an error page; only the stamp is best-effort.
 *   - No auth: the token is an unguessable random value and the only write
 *     it can cause is a one-time clickedAt stamp on its own row.
 *   - Machine fetches do not count as clicks. Mail security gateways and
 *     link prefetchers GET every href in a message to scan it. clickedAt is
 *     the sole input to isFollowUpDue() (lib/email/match-digest-policy.ts),
 *     so a scanner stamping it suppressed the one follow-up the employer was
 *     allowed and inflated the reported click rate. They still get redirected.
 */

/**
 * Does this GET look like a human opening a link, rather than a scanner or a
 * prefetcher?
 *
 * Conservative on purpose: only requests that positively announce themselves
 * as automated are excluded. A missed stamp costs a follow-up that was going
 * to be sent anyway; a false stamp costs the follow-up entirely.
 */
function isMachineFetch(request: NextRequest): boolean {
    // Chrome/Fetch Metadata and the older Google prefetch header.
    const secPurpose = request.headers.get('sec-purpose') || request.headers.get('purpose') || '';
    if (/prefetch|preview|prerender/i.test(secPurpose)) return true;

    const ua = request.headers.get('user-agent') || '';
    // An empty UA is a script, not a mail client.
    if (!ua.trim()) return true;
    return /bot|crawler|spider|slurp|preview|scanner|monitor|curl|wget|python-requests|okhttp|headlesschrome|safelinks|proofpoint|mimecast|barracuda|microsoft office/i.test(ua);
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('t');
    const destination = resolveClickDestination(searchParams.get('d'));

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com').replace(/\/$/, '');
    const redirect = NextResponse.redirect(new URL(destination, baseUrl), 302);

    // Rate limit guards the WRITE only — a 429 still redirects.
    const limited = await rateLimit(request, 'track:email-click', RATE_LIMITS.telemetry);
    if (limited) return redirect;

    if (token && token.length <= 128 && !isMachineFetch(request)) {
        try {
            await prisma.matchDigestEmail.updateMany({
                where: { clickToken: token, clickedAt: null },
                data: { clickedAt: new Date() },
            });
        } catch (err) {
            // Best-effort: log and redirect anyway.
            logger.error('[EmailClick] failed to stamp clickedAt', err);
        }
    }

    return redirect;
}
