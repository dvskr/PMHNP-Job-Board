import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { sendAndLog, getOrCreateUnsubToken } from '@/lib/email-service';
import {
    buildDigestForPosting,
    getMatchDigestStats,
} from '@/lib/match-digest-service';
import {
    buildMatchDigestHtml,
    buildMatchDigestSubject,
} from '@/lib/email/match-digest-template';

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com').replace(/\/$/, '');

/**
 * Admin-only test surface for employer match digests.
 *
 * GET  /api/admin/match-digest-test[?employerJobId=...]
 *   Outcome counts (digests sent / clicked / follow-ups, all-time + 30d),
 *   optionally scoped to one posting. This is the "track outcomes visibly"
 *   surface — the admin employers org table stays untouched.
 *
 * POST /api/admin/match-digest-test
 *   Body: { employerJobId: string, dryRun?: boolean }
 *   Renders the REAL digest for that posting (same exclusions the cron
 *   applies) and sends it TO THE AUTHENTICATED ADMIN'S OWN EMAIL, marked
 *   [TEST], regardless of ENABLE_EMPLOYER_MATCH_DIGESTS. The recipient is
 *   NEVER taken from the request body. No MatchDigestEmail row is written,
 *   so a test send does not consume the posting's cooldown or exclude the
 *   surfaced candidates from a future real digest. dryRun returns the
 *   rendered HTML without sending anything.
 */
export async function GET(request: NextRequest) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    const employerJobId = new URL(request.url).searchParams.get('employerJobId') ?? undefined;
    const stats = await getMatchDigestStats(employerJobId);
    return NextResponse.json({ success: true, stats });
}

const bodySchema = z.object({
    employerJobId: z.string().min(1).max(64),
    dryRun: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    // The ONLY allowed recipient is the authenticated admin's own address.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
        return NextResponse.json({ error: 'Admin session has no email' }, { status: 401 });
    }
    const adminEmail = user.email;

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 },
        );
    }
    const { employerJobId, dryRun = false } = parsed.data;

    try {
        const digest = await buildDigestForPosting(employerJobId);
        if (!digest.found) {
            return NextResponse.json({ error: 'Posting not found' }, { status: 404 });
        }
        const stats = await getMatchDigestStats(employerJobId);
        if (digest.candidates.length === 0) {
            return NextResponse.json({
                success: false,
                reason: digest.reason ?? 'no_matches',
                message: 'No sendable digest for this posting right now (no eligible candidate matches).',
                jobTitle: digest.jobTitle ?? null,
                stats,
            });
        }

        const unsubToken = await getOrCreateUnsubToken(adminEmail);
        // 'test' is not a real click token: /api/track/email-click redirects
        // unknown tokens without stamping, so test clicks never pollute stats.
        const html = buildMatchDigestHtml({
            baseUrl: BASE_URL,
            jobTitle: digest.jobTitle ?? '',
            candidates: digest.candidates,
            clickToken: 'test',
            unsubscribeToken: unsubToken,
            isTest: true,
        });
        const subject = buildMatchDigestSubject({
            candidateCount: digest.candidates.length,
            jobTitle: digest.jobTitle ?? '',
            isTest: true,
        });

        const summary = {
            employerJobId,
            jobTitle: digest.jobTitle ?? null,
            // The owning account's email, which is where a real digest goes.
            // Never EmployerJob.contactEmail (unverified free text).
            wouldGoTo: digest.recipientEmail ?? null,
            candidateCount: digest.candidates.length,
            candidates: digest.candidates.map((c) => ({
                displayName: c.displayName,
                // Raw cosine score, admin-only, so the operator can tune
                // MIN_MATCH_SIMILARITY against a real pool. Not in the email.
                similarity: c.similarity ?? null,
                licenseStates: c.licenseStates,
            })),
        };

        if (dryRun) {
            return NextResponse.json({ success: true, preview: true, subject, ...summary, html, stats });
        }

        const sendResult = await sendAndLog(
            { from: '', to: adminEmail, subject, html },
            'employer_match_digest',
            { test: true, employerJobId },
            `${BASE_URL}/unsubscribe?token=${unsubToken}`,
        );
        if (sendResult?.error) {
            return NextResponse.json(
                { error: `Send failed: ${sendResult.error.message}` },
                { status: 502 },
            );
        }

        logger.info('[MatchDigest] admin test digest sent', { employerJobId, to: adminEmail });
        return NextResponse.json({ success: true, sentTo: adminEmail, subject, ...summary, stats });
    } catch (err) {
        logger.error('[MatchDigest] admin test send failed', err, { employerJobId });
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
