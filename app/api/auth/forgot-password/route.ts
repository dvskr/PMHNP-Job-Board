import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { safeAuthRedirect } from '@/lib/auth/redirect-origin-guard';

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
 * The allow-list itself now lives in lib/auth/redirect-origin-guard.ts: it
 * matches exact hosts built from this deployment's own env-derived origins.
 * The `*.vercel.app` prefix heuristic that used to live here is gone, because
 * a Vercel project name is claimable by any account, so a prefixed host was
 * never proof of first-party ownership. Anything unrecognised is dropped and
 * Supabase falls back to its configured default.
 */

// Exported for tests/api/forgot-password-redirect-allowlist.test.ts — the
// allow-list is the whole security control here, so it is locked directly.
export function safeRedirectOrigin(raw: string | undefined): string | undefined {
    const safe = safeAuthRedirect(raw);
    if (raw && !safe) {
        // Host only: the rest of the URL is caller-controlled and belongs
        // nowhere near the log line.
        let host: string | null = null;
        try {
            host = new URL(raw).hostname;
        } catch {
            host = null;
        }
        logger.warn('forgot-password: rejected redirectTo outside the first-party allow-list', { host });
    }
    return safe;
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
