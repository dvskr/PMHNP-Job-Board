/**
 * GET /api/employer/candidates/[id]/resume
 *
 * On-demand fresh signed URL for a candidate's resume. Replaces the prior
 * pattern of baking a 1-hour signed URL into the candidate detail response
 * (which expired silently on long-open pages, surfacing as `InvalidJWT —
 * "exp" claim timestamp check failed` when the employer eventually clicked).
 *
 * Generates a 60-second signed URL on every click — long enough to redirect,
 * short enough that the URL can't be passed around. Re-checks unlock state
 * at click time so an employer who lost access since loading the page (e.g.
 * posting expired) can't still pull the resume.
 *
 * Returns a 302 redirect to the signed URL by default. Pass `?json=1` to
 * get the URL in JSON instead — useful for client-side fetch flows that
 * want to handle errors before navigating.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { mintResumeReadUrl, extractRequestContext } from '@/lib/resume-storage';

// Employer-side: extra-short TTL because the URL goes through a 302
// redirect and never lives in the browser address bar for long. 60s is
// long enough to redirect and start streaming, short enough that a
// shoulder-surf or screenshot leak window is bounded.
const SIGNED_URL_TTL_SECONDS = 60;

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
    const rl = await rateLimit(req, 'employer:resume-download', RATE_LIMITS.employer);
    if (rl) return rl;

    const { id } = await params;

    // Auth — employer or admin only.
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const viewer = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id },
        select: { role: true },
    });
    if (!viewer || (viewer.role !== 'employer' && viewer.role !== 'admin')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const isAdmin = viewer.role === 'admin';

    // Re-check unlock state at click time. Admins skip this — they have
    // full access by role.
    if (!isAdmin) {
        const view = await prisma.profileView.findUnique({
            where: {
                viewerId_candidateId: {
                    viewerId: user.id,
                    candidateId: id,
                },
            },
            select: { id: true },
        });
        if (!view) {
            return NextResponse.json(
                { error: 'You must unlock this candidate before downloading their resume.' },
                { status: 403 },
            );
        }
    }

    // Load the candidate with full privacy gates honored.
    const candidate = await prisma.userProfile.findFirst({
        where: {
            supabaseId: id,
            profileVisible: true,
            openToOffers: true,
            role: 'job_seeker',
        },
        select: { resumeUrl: true },
    });
    if (!candidate || !candidate.resumeUrl) {
        return NextResponse.json({ error: 'Resume not available' }, { status: 404 });
    }

    // Centralized helper handles both legacy URL and bare-path values
    // and audit-logs the access (audience='employer' or 'admin').
    const downloadUrl = await mintResumeReadUrl(candidate.resumeUrl, {
        actorId: user.id,
        ownerId: id,
        audience: isAdmin ? 'admin' : 'employer',
        action: 'download',
        ...extractRequestContext(req),
        reason: isAdmin ? 'admin candidate detail' : 'employer unlocked candidate',
    }, { ttlSeconds: SIGNED_URL_TTL_SECONDS });
    if (!downloadUrl) {
        return NextResponse.json({ error: 'Failed to generate download link' }, { status: 500 });
    }

    // Default behavior: 302 to the signed URL so a plain `<a href>` works.
    // Pass ?json=1 for the URL in a JSON envelope (client-side fetch flows).
    const wantsJson = new URL(req.url).searchParams.get('json') === '1';
    if (wantsJson) {
        return NextResponse.json({ url: downloadUrl, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
    }
    return NextResponse.redirect(downloadUrl);
}
