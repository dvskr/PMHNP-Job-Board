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
const ALLOWED_REDIRECT_HOSTS: ReadonlySet<string> = new Set([
    'pmhnphiring.com',
    'www.pmhnphiring.com',
    'localhost',
]);

function safeRedirectOrigin(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    try {
        const u = new URL(raw);
        if (u.hostname.endsWith('.vercel.app')) return raw;  // preview deploys
        if (ALLOWED_REDIRECT_HOSTS.has(u.hostname)) return raw;
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
