import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyExtensionToken } from '@/lib/verify-extension-token';


export async function GET(req: NextRequest) {
    try {
        const user = await verifyExtensionToken(req);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get current period (calendar month)
        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // Get usage for this period
        const usageRecords = await prisma.autofillUsage.findMany({
            where: {
                userId: user.userId,
                createdAt: { gte: periodStart, lte: periodEnd },
            },
        });

        const autofillsUsed = usageRecords.filter(r => r.fieldsFilled > 0).length;
        const aiGenerationsUsed = usageRecords.reduce((sum, r) => sum + r.aiGenerations, 0);

        // Check tier
        const profile = await prisma.userProfile.findUnique({
            where: { id: user.userId },
            select: { role: true },
        });

        const tier = profile?.role === 'premium' ? 'premium' : profile?.role === 'pro' ? 'pro' : 'free';

        const tierLimits: Record<string, { autofills: number | 'unlimited'; ai: number | 'unlimited' }> = {
            free: { autofills: 10, ai: 10 },
            pro: { autofills: 'unlimited' as const, ai: 100 },
            premium: { autofills: 'unlimited' as const, ai: 'unlimited' as const },
        };

        const limits = tierLimits[tier] || tierLimits.free;

        return NextResponse.json({
            autofillsUsed,
            autofillsRemaining: limits.autofills === 'unlimited'
                ? 'unlimited'
                : Math.max(0, (limits.autofills as number) - autofillsUsed),
            aiGenerationsUsed,
            aiGenerationsRemaining: limits.ai === 'unlimited'
                ? 'unlimited'
                : Math.max(0, (limits.ai as number) - aiGenerationsUsed),
            tier,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
        });
    } catch (error) {
        console.error('Usage fetch error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
