import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit-log';

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

    let parsed: z.infer<typeof bodySchema>;
    try {
        parsed = bodySchema.parse(await request.json());
    } catch (err) {
        return NextResponse.json(
            { error: 'Invalid request', details: err instanceof z.ZodError ? err.flatten() : undefined },
            { status: 400 },
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
            },
            select: { id: true, dueBy: true, type: true },
        });

        logger.info('DSAR received', {
            id: created.id,
            type: created.type,
            jurisdiction: parsed.jurisdiction,
        });

        void logAudit({
            action: 'data.request.received',
            actorType: 'user',
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
