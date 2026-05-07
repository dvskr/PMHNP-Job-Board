/**
 * GET /api/documents/resume/me/url
 *
 * Single read endpoint for the candidate's own resume — returns a fresh
 * 15-minute signed URL on every request and logs the access. Replaces
 * the prior pattern where ResumeUpload.handleView did
 * `window.open(currentResumeUrl)`, which silently failed when the
 * stored value was a bare storage path instead of a signed URL.
 *
 * Default behavior: returns `{ url, expiresInSeconds }` so the client
 * can decide what to do (open new tab, embed in an iframe, etc.).
 * Pass `?redirect=1` to get a 302 to the signed URL — useful for
 * plain `<a href="/api/.../url?redirect=1" target="_blank">` links.
 *
 * Owner-only. Employers / admins use the existing employer-scoped
 * endpoints which gate on unlock state.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { mintResumeReadUrl, extractRequestContext } from '@/lib/resume-storage';

export async function GET(req: NextRequest): Promise<NextResponse> {
    const rl = await rateLimit(req, 'documents:resume-me', RATE_LIMITS.profile);
    if (rl) return rl;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id },
        select: { resumeUrl: true },
    });
    if (!profile?.resumeUrl) {
        return NextResponse.json({ error: 'No resume on file' }, { status: 404 });
    }

    const url = await mintResumeReadUrl(profile.resumeUrl, {
        actorId: user.id,
        ownerId: user.id,
        audience: 'owner',
        action: 'view',
        ...extractRequestContext(req),
        reason: 'candidate viewing own resume from settings',
    });
    if (!url) {
        return NextResponse.json({ error: 'Failed to generate download link' }, { status: 500 });
    }

    const wantsRedirect = new URL(req.url).searchParams.get('redirect') === '1';
    if (wantsRedirect) {
        return NextResponse.redirect(url);
    }
    return NextResponse.json({ url, expiresInSeconds: 15 * 60 });
}
