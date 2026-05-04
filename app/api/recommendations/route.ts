/**
 * GET /api/recommendations — Phase 1 Sprint 1.2.
 *
 * Returns the latest batch of personalized recommendations for the
 * authenticated candidate. UI renders these in the "For you" section of the
 * candidate dashboard.
 *
 * Behind feature flag `ai.candidate.recommendations`. When the flag is off,
 * returns an empty array (not 404) so the UI just renders nothing instead of
 * showing an error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { isAiFeatureEnabled } from '@/lib/ai/feature-flags';

export async function GET(request: NextRequest): Promise<NextResponse> {
    const rl = await rateLimit(request, 'recs-list', { limit: 30, windowSeconds: 60 });
    if (rl) return rl;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const tenant = { type: 'candidate' as const, id: user.id };
    const enabled = await isAiFeatureEnabled('ai.candidate.recommendations', tenant);
    if (!enabled) {
        return NextResponse.json({ recommendations: [], enabled: false });
    }

    // Get the latest batchId for this candidate.
    const latest = await prisma.candidateRecommendation.findFirst({
        where: { supabaseId: user.id, dismissedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { batchId: true },
    });
    if (!latest) {
        return NextResponse.json({ recommendations: [], enabled: true });
    }

    const recs = await prisma.candidateRecommendation.findMany({
        where: { supabaseId: user.id, batchId: latest.batchId, dismissedAt: null },
        orderBy: { rank: 'asc' },
        include: {
            job: {
                select: {
                    id: true, title: true, employer: true, location: true,
                    state: true, isRemote: true, isHybrid: true,
                    displaySalary: true, slug: true, isFeatured: true,
                    descriptionSummary: true,
                },
            },
        },
    });

    return NextResponse.json({
        enabled: true,
        batchId: latest.batchId,
        recommendations: recs.map((r) => ({
            id: r.id,
            rank: r.rank,
            similarity: r.similarity,
            matchPercent: Math.round(r.similarity * 100),
            reason: r.reason,
            clickedAt: r.clickedAt,
            job: r.job,
        })),
    });
}
