/**
 * AI feature flags admin endpoints.
 *
 *   GET  /api/admin/ai/flags          → list every flag with its compiled
 *                                        default + every active override.
 *   POST /api/admin/ai/flags          → create or update an override.
 *
 * Sprint 0.4.4 — backs the kill-switch UI. A flip propagates to all instances
 * within the flag-cache TTL (60 sec). Use ?invalidate=1 on the POST response
 * to also bust the in-process cache locally if needed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { listFlags, invalidateFlagCache, type AiFeatureFlag } from '@/lib/ai/feature-flags';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest): Promise<NextResponse> {
    const auth = await requireApiAdmin(request);
    if (auth) return auth;

    const flags = listFlags();
    const overrides = await prisma.aiFeatureFlagOverride.findMany({
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: [{ flag: 'asc' }, { tenantType: 'asc' }, { tenantId: 'asc' }],
    });

    return NextResponse.json({ flags, overrides });
}

const overrideSchema = z.object({
    flag: z.string(),
    tenantType: z.enum(['employer', 'candidate', 'admin', 'global']),
    tenantId: z.string().nullable(),
    enabled: z.boolean(),
    reason: z.string().max(500).optional(),
    expiresAt: z.string().datetime().nullable().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
    const auth = await requireApiAdmin(request);
    if (auth) return auth;

    let body: unknown;
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = overrideSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const { flag, tenantType, tenantId, enabled, reason, expiresAt } = parsed.data;

    // Validate the flag is one we know about.
    const known = listFlags().some((f) => f.flag === flag);
    if (!known) {
        return NextResponse.json({ error: `Unknown flag "${flag}"` }, { status: 400 });
    }

    if (tenantType === 'global' && tenantId !== null) {
        return NextResponse.json({ error: 'global override must have tenantId=null' }, { status: 400 });
    }
    if (tenantType !== 'global' && tenantId === null) {
        return NextResponse.json({ error: 'non-global override requires tenantId' }, { status: 400 });
    }

    // Use a delete + create instead of upsert because the unique index uses
    // COALESCE on tenantId — which Prisma's upsert doesn't model cleanly.
    await prisma.aiFeatureFlagOverride.deleteMany({
        where: { flag, tenantType, tenantId },
    });
    const row = await prisma.aiFeatureFlagOverride.create({
        data: {
            flag,
            tenantType,
            tenantId,
            enabled,
            reason: reason ?? null,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
    });

    invalidateFlagCache(flag as AiFeatureFlag);
    logger.info('AI feature flag override updated', { flag, tenantType, tenantId, enabled });

    return NextResponse.json({ override: row });
}
