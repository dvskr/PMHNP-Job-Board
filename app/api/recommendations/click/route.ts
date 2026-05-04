/**
 * POST /api/recommendations/click — record a click-through on a recommendation.
 *
 * Idempotent (writes clicked_at only if currently null). Used as a training
 * signal for click-feedback rerank in a later sprint.
 *
 * Body: { recommendationId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

const bodySchema = z.object({
    recommendationId: z.string().min(1),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
    const rl = await rateLimit(request, 'recs-click', { limit: 60, windowSeconds: 60 });
    if (rl) return rl;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let body: unknown;
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
    }

    // Only update if it belongs to the user AND hasn't been clicked yet.
    const updated = await prisma.candidateRecommendation.updateMany({
        where: {
            id: parsed.data.recommendationId,
            supabaseId: user.id,
            clickedAt: null,
        },
        data: { clickedAt: new Date() },
    });

    return NextResponse.json({ recorded: updated.count > 0 });
}
