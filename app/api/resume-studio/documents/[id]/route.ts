/**
 * /api/resume-studio/documents/[id]
 *
 * GET    — full document (including sections Json).
 * PATCH  — update title, template, sections, and/or the default flag.
 *          Setting isDefault true clears the flag on the user's other
 *          documents inside a transaction, so at most one default exists.
 * DELETE — hard delete; users expect "delete" to mean gone.
 *
 * Every query is scoped by BOTH id AND the caller's UserProfile.id, so a
 * foreign document id looks identical to a missing one: 404, never 403.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { sanitizeText } from '@/lib/sanitize';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import {
    parseSections,
    RESUME_CONTENT_VERSION,
    type ResumeSections,
} from '@/lib/resume-studio/sections';
import { resolveStyle } from '@/lib/resume-studio/templates';

const DOCUMENT_RATE_LIMIT = { limit: 30, windowSeconds: 60 };
const MAX_TITLE_LENGTH = 120;
const SANITIZE_MAX_LENGTH = 2000; // >= every per-field clamp in parseSections

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
    title: z.string().optional(),
    // Template ids come from lib/resume-studio/templates.ts (the registry the
    // preview and PDF both read).
    template: z.enum(['classic', 'modern', 'minimal', 'enterprise', 'executive']).optional(),
    sections: z.unknown().optional(),
    isDefault: z.boolean().optional(),
    /** Presentation options; validated by resolveStyle before persisting. */
    styleConfig: z
        .object({
            font: z.enum(['plex-serif', 'lora', 'franklin', 'grotesk']).optional(),
            density: z.enum(['roomy', 'compact']).optional(),
            paper: z.enum(['letter', 'legal']).optional(),
        })
        .optional(),
});

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

/**
 * Defense in depth at the API boundary: run sanitizeText over every string
 * inside the (already zod-validated and clamped) sections object. Booleans
 * pass through untouched. sanitizeText only removes content, so the
 * parseSections length clamps still hold afterward.
 */
function deepSanitizeStrings<T>(value: T): T {
    if (typeof value === 'string') {
        return sanitizeText(value, SANITIZE_MAX_LENGTH) as unknown as T;
    }
    if (Array.isArray(value)) {
        return value.map((item) => deepSanitizeStrings(item)) as unknown as T;
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
                key,
                deepSanitizeStrings(entry),
            ])
        ) as unknown as T;
    }
    return value;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
    const rateLimitResult = await rateLimit(request, 'resume-studio:document', DOCUMENT_RATE_LIMIT);
    if (rateLimitResult) return rateLimitResult;

    try {
        const auth = await requireProfile();
        if (auth.response) return auth.response;

        const { id } = await params;
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

        const document = await prisma.resumeDocument.findFirst({
            where: { id, userId: auth.profileId },
        });
        if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        return NextResponse.json({ document });
    } catch (err) {
        logger.error('Resume document GET failed', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
    const rateLimitResult = await rateLimit(request, 'resume-studio:document', DOCUMENT_RATE_LIMIT);
    if (rateLimitResult) return rateLimitResult;

    try {
        const auth = await requireProfile();
        if (auth.response) return auth.response;
        const profileId = auth.profileId;

        const { id } = await params;
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

        let rawBody: unknown;
        try {
            rawBody = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const parsedBody = patchSchema.safeParse(rawBody);
        if (!parsedBody.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsedBody.error.issues },
                { status: 400 }
            );
        }
        const { title, template, isDefault, styleConfig } = parsedBody.data;

        let sections: ResumeSections | undefined;
        if (parsedBody.data.sections !== undefined) {
            try {
                sections = deepSanitizeStrings(parseSections(parsedBody.data.sections));
            } catch (err) {
                if (err instanceof ZodError) {
                    return NextResponse.json(
                        { error: 'Invalid sections', details: err.issues },
                        { status: 400 }
                    );
                }
                throw err;
            }
        }

        const data: Prisma.ResumeDocumentUpdateInput = {};
        if (title !== undefined) {
            const cleanTitle = sanitizeText(title, MAX_TITLE_LENGTH);
            if (!cleanTitle) return NextResponse.json({ error: 'Invalid title' }, { status: 400 });
            data.title = cleanTitle;
        }
        if (template !== undefined) data.template = template;
        if (styleConfig !== undefined) {
            // Normalize through the registry so only known ids are persisted
            // and a partial patch still yields a complete config.
            data.styleConfig = resolveStyle(
                styleConfig,
                template ?? undefined,
            ) as unknown as Prisma.InputJsonValue;
        }
        if (sections !== undefined) {
            data.sections = sections as unknown as Prisma.InputJsonValue;
            data.contentVersion = RESUME_CONTENT_VERSION;
        }
        if (isDefault !== undefined) data.isDefault = isDefault;

        if (Object.keys(data).length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        // Ownership check before writing: a foreign or missing id is a 404.
        const existing = await prisma.resumeDocument.findFirst({
            where: { id, userId: profileId },
            select: { id: true },
        });
        if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        let document;
        if (isDefault === true) {
            // Single default per user: clear the flag everywhere else, then
            // set it here, atomically.
            [, document] = await prisma.$transaction([
                prisma.resumeDocument.updateMany({
                    where: { userId: profileId, id: { not: id } },
                    data: { isDefault: false },
                }),
                prisma.resumeDocument.update({ where: { id }, data }),
            ]);
        } else {
            document = await prisma.resumeDocument.update({ where: { id }, data });
        }

        return NextResponse.json({ document });
    } catch (err) {
        logger.error('Resume document PATCH failed', err);
        return NextResponse.json({ error: 'Failed to update resume document' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
    const rateLimitResult = await rateLimit(request, 'resume-studio:document', DOCUMENT_RATE_LIMIT);
    if (rateLimitResult) return rateLimitResult;

    try {
        const auth = await requireProfile();
        if (auth.response) return auth.response;

        const { id } = await params;
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

        // deleteMany so a foreign or missing id returns count 0 instead of
        // throwing; the userId filter makes cross-user deletion impossible.
        const result = await prisma.resumeDocument.deleteMany({
            where: { id, userId: auth.profileId },
        });
        if (result.count === 0) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        logger.error('Resume document DELETE failed', err);
        return NextResponse.json({ error: 'Failed to delete resume document' }, { status: 500 });
    }
}
