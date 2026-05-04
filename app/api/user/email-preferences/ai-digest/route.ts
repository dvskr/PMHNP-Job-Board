/**
 * User-scoped opt-in for the weekly AI recommendations digest email.
 *
 *   GET  /api/user/email-preferences/ai-digest  → { enabled: boolean }
 *   POST { enabled: boolean }                   → upsert + return new state
 *
 * Mechanism: writes a row to `ai_feature_flag_override` scoped to the
 * caller's own (tenantType='candidate', tenantId=user.id) for the
 * `ai.candidate.recommendations_email` flag. The weekly digest cron
 * (lib/inngest/functions/recommendation-digest.ts) reads this via
 * isAiFeatureEnabled() per-candidate and skips users whose flag is off.
 *
 * Scope is hard-locked to the caller's own tenant — this endpoint cannot
 * be used to toggle another user's flag (only admins can do that via
 * /api/admin/ai/flags).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { invalidateFlagCache } from '@/lib/ai/feature-flags';

const FLAG = 'ai.candidate.recommendations_email';

async function getCurrentUser(): Promise<{ id: string } | null> {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return { id: user.id };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const rl = await rateLimit(request, 'user:email-prefs:get', { limit: 30, windowSeconds: 60 });
    if (rl) return rl;

    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const override = await prisma.aiFeatureFlagOverride.findFirst({
        where: {
            flag: FLAG,
            tenantType: 'candidate',
            tenantId: user.id,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { enabled: true },
    });

    // Default state when no override exists = OFF (opt-in by design;
    // the compiled default for this flag is false).
    return NextResponse.json({ enabled: override?.enabled ?? false });
}

const bodySchema = z.object({ enabled: z.boolean() });

export async function POST(request: NextRequest): Promise<NextResponse> {
    const rl = await rateLimit(request, 'user:email-prefs:post', { limit: 10, windowSeconds: 60 });
    if (rl) return rl;

    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }
    const { enabled } = parsed.data;

    // Upsert the override scoped to this user only. The unique index on
    // (flag, tenantType, tenantId) makes this idempotent — opt out then
    // opt in then opt out flips the same row, doesn't accumulate.
    const existing = await prisma.aiFeatureFlagOverride.findFirst({
        where: { flag: FLAG, tenantType: 'candidate', tenantId: user.id },
        select: { id: true },
    });
    if (existing) {
        await prisma.aiFeatureFlagOverride.update({
            where: { id: existing.id },
            data: {
                enabled,
                reason: 'User self-service via /settings',
                setBy: user.id,
                expiresAt: null,
            },
        });
    } else {
        await prisma.aiFeatureFlagOverride.create({
            data: {
                flag: FLAG,
                tenantType: 'candidate',
                tenantId: user.id,
                enabled,
                reason: 'User self-service via /settings',
                setBy: user.id,
            },
        });
    }

    // When opting IN, ensure an email_leads row exists for this user's
    // email so the digest cron has an unsubscribe token. The digest is
    // independent of the general newsletter — we DO NOT flip
    // newsletter_opt_in here. Existing rows are left untouched (the user
    // may already have set their newsletter preference; respect it).
    if (enabled) {
        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { email: true },
        });
        if (profile?.email) {
            const existingLead = await prisma.emailLead.findUnique({
                where: { email: profile.email },
                select: { id: true },
            });
            if (!existingLead) {
                await prisma.emailLead.create({
                    data: {
                        email: profile.email,
                        source: 'ai-digest-optin',
                        // Default newsletterOptIn=false — the AI digest is
                        // independent and the user hasn't opted into the
                        // general newsletter through this endpoint.
                    },
                });
            }
        }
    }

    // Bust the local flag cache so the next isAiFeatureEnabled() call
    // sees the fresh value without waiting for the 60-sec TTL.
    invalidateFlagCache(FLAG);

    return NextResponse.json({ enabled });
}
