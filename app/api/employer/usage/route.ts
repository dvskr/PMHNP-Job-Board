import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { getUsageSummary, getEmployerTier, getPerPostingUsage } from '@/lib/tier-limits';
import { config, PricingTier } from '@/lib/config';
import { AI_DAILY_CAPS } from '@/lib/ai-usage';
import { midnightCentralTimeAsUtc } from '@/lib/time';

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
        // AI search usage (today, Central Time). Counted from ai_call_log for
        // the talent_search_rerank task. Both the cap and the reset window come
        // from the files that own them, the same ones
        // /api/employer/talent/search enforces. They used to be a local literal
        // and a verbatim copy of midnightCentralTimeAsUtc, so bumping the cap
        // in lib/ai-usage.ts changed what the search route allowed while the
        // dashboard kept telling the employer the old number.
        const AI_SEARCH_CAP = AI_DAILY_CAPS.talent_search_rerank;
        const midnightCt = midnightCentralTimeAsUtc();

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
