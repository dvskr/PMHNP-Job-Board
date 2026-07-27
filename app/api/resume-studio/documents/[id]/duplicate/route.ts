/**
 * POST /api/resume-studio/documents/[id]/duplicate
 *
 * Copies an owned resume document under a ' (copy)' title, never as the
 * default. Shares the 10-document cap and the documents-collection rate
 * limit with POST /documents since both create rows.
 *
 * Owner scoping: the source lookup filters by id AND the caller's
 * UserProfile.id, so a foreign id is a 404, never a 403.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const DOCUMENTS_RATE_LIMIT = { limit: 20, windowSeconds: 60 };
const MAX_DOCUMENTS_PER_USER = 10;
const MAX_TITLE_LENGTH = 120;
const COPY_SUFFIX = ' (copy)';

type RouteContext = { params: Promise<{ id: string }> };

type ProfileAuth =
    | { profileId: string; response?: undefined }
    | { profileId?: undefined; response: NextResponse };

async function requireProfile(): Promise<ProfileAuth> {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id },
        select: { id: true },
    });
    if (!profile) {
        return { response: NextResponse.json({ error: 'Profile not found' }, { status: 404 }) };
    }

    return { profileId: profile.id };
}

/** Append the copy suffix while keeping the whole title within the limit. */
function buildCopyTitle(title: string): string {
    const base = title.slice(0, MAX_TITLE_LENGTH - COPY_SUFFIX.length).trimEnd();
    return `${base}${COPY_SUFFIX}`;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
    const rateLimitResult = await rateLimit(request, 'resume-studio:documents', DOCUMENTS_RATE_LIMIT);
    if (rateLimitResult) return rateLimitResult;

    try {
        const auth = await requireProfile();
        if (auth.response) return auth.response;
        const profileId = auth.profileId;

        const { id } = await params;
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

        const source = await prisma.resumeDocument.findFirst({
            where: { id, userId: profileId },
        });
        if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        const existingCount = await prisma.resumeDocument.count({ where: { userId: profileId } });
        if (existingCount >= MAX_DOCUMENTS_PER_USER) {
            return NextResponse.json(
                {
                    error: 'Document limit reached',
                    message: `You can keep up to ${MAX_DOCUMENTS_PER_USER} resumes. Delete one to duplicate this resume.`,
                },
                { status: 409 }
            );
        }

        const document = await prisma.resumeDocument.create({
            data: {
                userId: profileId,
                title: buildCopyTitle(source.title),
                template: source.template,
                sections: source.sections as Prisma.InputJsonValue,
                contentVersion: source.contentVersion,
                isDefault: false,
            },
        });

        return NextResponse.json({ document }, { status: 201 });
    } catch (err) {
        logger.error('Resume document duplicate failed', err);
        return NextResponse.json({ error: 'Failed to duplicate resume document' }, { status: 500 });
    }
}
