import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit-log';
import { createClient } from '@/lib/supabase/server';

const PURGE_GRACE_DAYS = 30;

/**
 * DSAR intake endpoint.
 *
 * Accepts requests under GDPR Art. 15-22 and CCPA/CPRA. Computes the
 * regulatory deadline at insert time so a daily admin task can list
 * overdue requests and escalate.
 *
 * Requires the `data_requests` table — created by the migration named
 * `add_data_request`. Run `npx prisma migrate dev --name add_data_request`
 * once before this endpoint can persist requests.
 */

const REQUEST_TYPES = [
    'access',
    'deletion',
    'correction',
    'portability',
    'object',
    'restrict',
    'opt_out_sale',
] as const;
const JURISDICTIONS = ['gdpr', 'ccpa', 'lgpd', 'pipeda', 'other'] as const;

const bodySchema = z.object({
    email: z.string().email().max(254),
    fullName: z.string().min(1).max(120).optional(),
    type: z.enum(REQUEST_TYPES),
    description: z.string().max(2000).optional(),
    jurisdiction: z.enum(JURISDICTIONS).optional(),
});

function deadlineFor(jurisdiction?: string): Date {
    // GDPR: 30 days. CCPA: 45 days. We pick the shorter applicable one.
    const days = jurisdiction === 'ccpa' ? 45 : 30;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function POST(request: NextRequest) {
    const limited = await rateLimit(request, 'data-request', RATE_LIMITS.dataRequest);
    if (limited) return limited;

    // P2 — identity guard: a DSAR may only be filed by the data subject. Require
    // an authenticated session and verify the request email owns the account.
    // Without this the endpoint was filing (and now executing) requests on behalf
    // of arbitrary email addresses.
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let parsed: z.infer<typeof bodySchema>;
    try {
        parsed = bodySchema.parse(await request.json());
    } catch (err) {
        return NextResponse.json(
            { error: 'Invalid request', details: err instanceof z.ZodError ? err.flatten() : undefined },
            { status: 400 },
        );
    }

    if (parsed.email.toLowerCase() !== (user.email ?? '').toLowerCase()) {
        return NextResponse.json(
            { error: 'Email does not match authenticated account' },
            { status: 403 },
        );
    }

    const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        null;
    const userAgent = request.headers.get('user-agent') || null;

    try {
        const created = await prisma.dataRequest.create({
            data: {
                email: parsed.email.toLowerCase(),
                fullName: parsed.fullName ?? null,
                type: parsed.type,
                description: parsed.description ?? null,
                jurisdiction: parsed.jurisdiction ?? null,
                requesterIp: ip,
                userAgent,
                dueBy: deadlineFor(parsed.jurisdiction),
                acknowledgedAt: new Date(),
                // Identity is proven by the verified session above.
                identityVerified: true,
                status: 'in_progress',
            },
            select: { id: true, dueBy: true, type: true },
        });

        // P2 — actually execute the request instead of only recording it.
        //   deletion → soft-delete the profile (mirrors /api/auth/delete-account);
        //              the purge-soft-deleted cron hard-erases after the grace window.
        //   access   → return a profile snapshot.
        //   other types (correction, portability, …) → recorded for manual admin
        //              follow-up; status stays 'in_progress'.
        let actionResult: Record<string, unknown> = {};

        if (parsed.type === 'deletion') {
            const purgeAt = new Date(Date.now() + PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000);
            // updateMany (not update) so a profileless authenticated user — e.g. an
            // OAuth signup that never completed onboarding — doesn't throw P2025 and
            // leave an orphaned in_progress DSAR + a still-signed-in session.
            const profileUpdate = await prisma.userProfile.updateMany({
                where: { supabaseId: user.id },
                data: {
                    deletedAt: new Date(),
                    purgeAt,
                    profileVisible: false,
                    openToOffers: false,
                    emailSuppressed: true,
                    emailSuppressedAt: new Date(),
                },
            });
            await prisma.dataRequest.update({
                where: { id: created.id },
                data: {
                    status: 'completed',
                    completedAt: new Date(),
                    ...(profileUpdate.count === 0
                        ? { resolutionNote: 'No profile row existed at deletion time (auth identity only).' }
                        : {}),
                },
            });
            await supabase.auth.signOut();
            actionResult = { scheduled: true, purgeAt: purgeAt.toISOString(), graceDays: PURGE_GRACE_DAYS };
        } else if (parsed.type === 'access') {
            // GDPR Art. 15 / CCPA require ALL personal data held — not a subset.
            // No `select` → every profile scalar (EEO, NPI/DEA, address, …) is
            // returned, plus the directly-attributable related records (the same
            // set the dedicated /api/profile/export endpoint discloses).
            const profile = await prisma.userProfile.findUnique({
                where: { supabaseId: user.id },
                include: {
                    licenses: true,
                    certificationRecords: true,
                    education: true,
                    workExperience: true,
                    screeningAnswers: true,
                    openEndedResponses: true,
                    candidateReferences: true,
                },
            });
            await prisma.dataRequest.update({
                where: { id: created.id },
                data: { status: 'completed', completedAt: new Date() },
            });
            actionResult = { export: profile ?? {} };
        }

        logger.info('DSAR received and actioned', {
            id: created.id,
            type: created.type,
            jurisdiction: parsed.jurisdiction,
        });

        void logAudit({
            action: 'data.request.received',
            actorType: 'user',
            actorId: user.id,
            targetType: 'data_request',
            targetId: created.id,
            ip,
            userAgent,
            metadata: {
                type: created.type,
                jurisdiction: parsed.jurisdiction ?? null,
                dueBy: created.dueBy.toISOString(),
            },
        });

        return NextResponse.json(
            {
                ok: true,
                id: created.id,
                respondBy: created.dueBy.toISOString(),
                ...actionResult,
            },
            { status: 201 },
        );
    } catch (err) {
        // The most likely error here is "table data_requests does not exist"
        // before the migration has been applied. Surface a clear message so
        // ops can fix it without grepping the logs.
        const isMissingTable =
            err instanceof Error &&
            /does not exist|relation .* data_requests/i.test(err.message);
        logger.error('DSAR insert failed', err);
        return NextResponse.json(
            {
                error: isMissingTable
                    ? 'DSAR table missing — run prisma migrate add_data_request'
                    : 'Failed to record request',
            },
            { status: isMissingTable ? 503 : 500 },
        );
    }
}
