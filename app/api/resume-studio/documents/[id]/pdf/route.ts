/**
 * GET /api/resume-studio/documents/[id]/pdf
 *
 * Renders an owned resume document to PDF (@react-pdf/renderer, standard
 * fonts only) and returns it as an attachment download. Presentation comes
 * from the row's template and styleConfig columns, which the renderer feeds
 * to resolveResumeStyle(), so the export cannot drift from the preview. The
 * document lookup is scoped by id AND the caller's UserProfile.id, so a
 * foreign id is a 404, never a 403. Rendering is CPU-bound, hence the tighter
 * rate limit than the CRUD routes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { parseSections, type ResumeSections } from '@/lib/resume-studio/sections';
import { renderResumePdf } from '@/lib/resume-studio/pdf';

const PDF_RATE_LIMIT = { limit: 10, windowSeconds: 60 };
const MAX_FILENAME_LENGTH = 80;

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

/** Lowercase, alphanumeric plus hyphens, bounded length, safe for headers. */
function slugifyTitle(title: string): string {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, MAX_FILENAME_LENGTH)
        .replace(/-+$/g, '');
    return slug || 'resume';
}

export async function GET(request: NextRequest, { params }: RouteContext) {
    const rateLimitResult = await rateLimit(request, 'resume-studio:pdf', PDF_RATE_LIMIT);
    if (rateLimitResult) return rateLimitResult;

    try {
        const auth = await requireProfile();
        if (auth.response) return auth.response;

        const { id } = await params;
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

        const document = await prisma.resumeDocument.findFirst({
            where: { id, userId: auth.profileId },
            select: { title: true, template: true, styleConfig: true, sections: true },
        });
        if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        let sections: ResumeSections;
        try {
            sections = parseSections(document.sections);
        } catch (err) {
            logger.error('Resume document has invalid sections Json', { documentId: id, err });
            return NextResponse.json(
                { error: 'This resume could not be rendered. Edit and save it, then try again.' },
                { status: 500 }
            );
        }

        // template + styleConfig drive the whole export through
        // resolveResumeStyle(), the same registry the live preview reads, so a
        // download always matches what the editor showed.
        const pdfBuffer = await renderResumePdf(
            sections,
            document.template,
            document.styleConfig,
            document.title,
        );
        const filename = `${slugifyTitle(document.title)}.pdf`;

        return new NextResponse(new Uint8Array(pdfBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': String(pdfBuffer.length),
                'Cache-Control': 'private, no-store',
            },
        });
    } catch (err) {
        logger.error('Resume document PDF failed', err);
        return NextResponse.json({ error: 'Failed to generate the PDF' }, { status: 500 });
    }
}
