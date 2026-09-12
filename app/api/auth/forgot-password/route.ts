import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/forgot-password
 *
 * Server-side wrapper around Supabase's resetPasswordForEmail so we can
 * enforce a tighter rate limit (3 requests per hour per IP) than the
 * default client-side flow. Closes audit gap #14.
 *
 * The response is intentionally identical for "email exists" and "email
 * doesn't exist" — leaking the difference would let an attacker
 * enumerate valid accounts. Always returns 200 unless the request is
 * malformed or rate-limited.
 */
const bodySchema = z.object({
    email: z.string().email().max(254),
    redirectTo: z.string().url().optional(),
});

/**
 * Sec2 fix (2026-06-01): only allow first-party origins for the
 * password-reset redirect. Pre-fix the body's `redirectTo` was passed
 * straight to Supabase, which embedded it in the reset email link as
 * `?next=` — any URL was accepted, so an attacker could craft a reset
 * link that, after a successful login, bounced the user to
 * `https://evil.example.com?token=…` for phishing or session theft.
 *
 * Allow-list: production canonical + Vercel preview deployments + local
 * dev. Anything else is silently dropped (falls back to Supabase's
 * configured default).
 */
const ALLOWED_REDIRECT_HOSTS: ReadonlySet<string> = new Set(
    [
        'pmhnphiring.com',
        'www.pmhnphiring.com',
        'dev.pmhnphiring.com',
        'localhost',
        '127.0.0.1',
        // Whatever this deployment calls itself, so a custom domain or a
        // renamed preview keeps working without another code change.
        hostnameOf(process.env.NEXT_PUBLIC_BASE_URL),
        process.env.VERCEL_URL,
        process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ].filter((h): h is string => !!h),
);

function hostnameOf(value: string | undefined): string | undefined {
    if (!value) return undefined;
    try {
        return new URL(value).hostname;
    } catch {
        return undefined;
    }
}

/**
 * Preview deployments of THIS project only.
 *
 * The previous check accepted any host ending in `.vercel.app`. That suffix is
 * third-party registrable: anyone can deploy `pmhnp-reset.vercel.app` in their
 * own account, pass it as `redirectTo`, and have the genuine password-reset
 * email carry the victim to their page after the reset completes. That is the
 * exact open redirect this allow-list exists to close, so the suffix must be
 * paired with the project's own deployment prefix.
 */
const VERCEL_PREVIEW_PREFIX = 'pmhnp-job-board';

function isFirstPartyVercelPreview(hostname: string): boolean {
    if (!hostname.endsWith('.vercel.app')) return false;
    return hostname.startsWith(`${VERCEL_PREVIEW_PREFIX}-`) || hostname === `${VERCEL_PREVIEW_PREFIX}.vercel.app`;
}

// Exported for tests/api/forgot-password-redirect-allowlist.test.ts — the
// allow-list is the whole security control here, so it is locked directly.
export function safeRedirectOrigin(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    try {
        const u = new URL(raw);
        if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
            logger.warn('forgot-password: rejected non-https redirectTo', { host: u.hostname });
            return undefined;
        }
        if (ALLOWED_REDIRECT_HOSTS.has(u.hostname)) return raw;
        if (isFirstPartyVercelPreview(u.hostname)) return raw;
        logger.warn('forgot-password: rejected redirectTo with unknown host', { host: u.hostname });
        return undefined;
    } catch {
        return undefined;
    }
}

export async function POST(request: NextRequest) {
    const limited = await rateLimit(request, 'forgot-password', {
        limit: 3,
        windowSeconds: 3600,
    });
    if (limited) return limited;

    let parsed: z.infer<typeof bodySchema>;
    try {
        parsed = bodySchema.parse(await request.json());
    } catch (err) {
        return NextResponse.json(
            { error: 'Invalid request' },
            { status: 400 },
        );
    }

    try {
        // Use the anon client (not service-role) so Supabase performs the
        // same email-enumeration-safe path the client SDK does. We just
        // get a server-controlled rate limit in front of it.
        const supabase = createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const safeRedirect = safeRedirectOrigin(parsed.redirectTo);
        await supabase.auth.resetPasswordForEmail(parsed.email.toLowerCase(), {
            redirectTo: safeRedirect,
        });
    } catch (err) {
        logger.warn('forgot-password resetPasswordForEmail failed', err as Record<string, unknown>);
    }

    // Identical 200 OK response shape regardless of outcome.
    return NextResponse.json({
        ok: true,
        message: 'If an account exists for that email, a reset link has been sent.',
    });
}
