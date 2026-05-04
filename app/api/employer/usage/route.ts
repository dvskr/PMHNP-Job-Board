import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { getUsageSummary, getEmployerTier, getPerPostingUsage } from '@/lib/tier-limits';
import { config, PricingTier } from '@/lib/config';

/**
 * GET /api/employer/usage — Return the employer's current tier and usage limits
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true, role: true },
        });

        if (!profile || !['employer', 'admin'].includes(profile.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const tier = await getEmployerTier(user.id);
        // AI search usage (today, Central Time). Counted from ai_call_log
        // for the talent_search_rerank task. Same cap + reset window the
        // talent search route enforces — keep the values in sync if the
        // route ever bumps the cap.
        const AI_SEARCH_CAP = 10;
        const midnightCt = (() => {
            const now = new Date();
            const dateStr = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Chicago',
                year: 'numeric', month: '2-digit', day: '2-digit',
            }).format(now);
            const offsetParts = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/Chicago', timeZoneName: 'longOffset',
            }).formatToParts(now);
            const offsetRaw = offsetParts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-06:00';
            return new Date(`${dateStr}T00:00:00${offsetRaw.replace('GMT', '') || '-06:00'}`);
        })();

        const [usage, postings, aiSearchesUsed] = await Promise.all([
            getUsageSummary(profile.id, user.id, tier),
            getPerPostingUsage(profile.id, user.id),
            prisma.aiCallLog.count({
                where: {
                    task: 'talent_search_rerank',
                    tenantType: 'employer',
                    tenantId: user.id,
                    createdAt: { gte: midnightCt },
                },
            }),
        ]);

        return NextResponse.json({
            tier,
            tierLabel: config.getTierLabel(tier),
            usage: {
                candidateUnlocks: {
                    used: usage.candidateUnlocks.used,
                    limit: Number.isFinite(usage.candidateUnlocks.limit) ? usage.candidateUnlocks.limit : null,
                    unlimited: !Number.isFinite(usage.candidateUnlocks.limit),
                },
                inmails: {
                    used: usage.inmails.used,
                    limit: Number.isFinite(usage.inmails.limit) ? usage.inmails.limit : null,
                    unlimited: !Number.isFinite(usage.inmails.limit),
                },
                aiSearches: {
                    used: aiSearchesUsed,
                    limit: AI_SEARCH_CAP,
                    remaining: Math.max(0, AI_SEARCH_CAP - aiSearchesUsed),
                },
            },
            postings,
        });
    } catch (error) {
        console.error('Error fetching employer usage:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
