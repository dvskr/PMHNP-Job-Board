/**
 * /api/resume-studio/documents
 *
 * GET  — list the caller's resume documents (metadata only, newest first).
 * POST — create a document, seeded from the candidate profile by default.
 *        The first document a user creates becomes their default. Hard cap
 *        of 10 documents per user keeps the studio (and Json storage) bounded.
 *
 * Owner scoping: every query filters by the caller's UserProfile.id, resolved
 * from the Supabase session. No cross-user access is possible.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { sanitizeText } from '@/lib/sanitize';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import {
    emptySections,
    seedSectionsFromProfile,
    RESUME_CONTENT_VERSION,
} from '@/lib/resume-studio/sections';

const DOCUMENTS_RATE_LIMIT = { limit: 20, windowSeconds: 60 };
const MAX_DOCUMENTS_PER_USER = 10;
const MAX_TITLE_LENGTH = 120;
const DEFAULT_TITLE = 'My PMHNP Resume';

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

export async function GET(request: NextRequest) {
    const rateLimitResult = await rateLimit(request, 'resume-studio:documents', DOCUMENTS_RATE_LIMIT);
    if (rateLimitResult) return rateLimitResult;

    try {
        const auth = await requireProfile();
        if (auth.response) return auth.response;

        const documents = await prisma.resumeDocument.findMany({
            where: { userId: auth.profileId },
            orderBy: { updatedAt: 'desc' },
            select: { id: true, title: true, template: true, isDefault: true, updatedAt: true },
        });

        return NextResponse.json({ documents });
    } catch (err) {
        logger.error('Resume documents GET failed', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const rateLimitResult = await rateLimit(request, 'resume-studio:documents', DOCUMENTS_RATE_LIMIT);
    if (rateLimitResult) return rateLimitResult;

    try {
        const auth = await requireProfile();
        if (auth.response) return auth.response;
        const profileId = auth.profileId;

        // Body is optional: {} means "seed a document with the default title".
        let body: { title?: unknown; seedFromProfile?: unknown } = {};
        try {
            body = await request.json();
        } catch {
            body = {};
        }

        if (body.title !== undefined && typeof body.title !== 'string') {
            return NextResponse.json({ error: 'Invalid title' }, { status: 400 });
        }
        const title =
            typeof body.title === 'string' && sanitizeText(body.title, MAX_TITLE_LENGTH).length > 0
                ? sanitizeText(body.title, MAX_TITLE_LENGTH)
                : DEFAULT_TITLE;
        const seedFromProfile = body.seedFromProfile !== false;

        const existingCount = await prisma.resumeDocument.count({ where: { userId: profileId } });
        if (existingCount >= MAX_DOCUMENTS_PER_USER) {
            return NextResponse.json(
                {
                    error: 'Document limit reached',
                    message: `You can keep up to ${MAX_DOCUMENTS_PER_USER} resumes. Delete one to create another.`,
                },
                { status: 409 }
            );
        }

        const sections = seedFromProfile
            ? await seedSectionsFromProfile(profileId)
            : emptySections();

        const document = await prisma.resumeDocument.create({
            data: {
                userId: profileId,
                title,
                sections: sections as unknown as Prisma.InputJsonValue,
                contentVersion: RESUME_CONTENT_VERSION,
                isDefault: existingCount === 0,
            },
        });

        return NextResponse.json({ document }, { status: 201 });
    } catch (err) {
        logger.error('Resume documents POST failed', err);
        return NextResponse.json({ error: 'Failed to create resume document' }, { status: 500 });
    }
}
