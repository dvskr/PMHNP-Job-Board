import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { getUsageSummary, getEmployerTier } from '@/lib/tier-limits';
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
        const usage = await getUsageSummary(profile.id, user.id, tier);

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
            },
        });
    } catch (error) {
        console.error('Error fetching employer usage:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
