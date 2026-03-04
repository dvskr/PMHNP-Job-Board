import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';

/**
 * GET /api/admin/email/templates — List all templates
 * POST /api/admin/email/templates — Create/update a template
 * DELETE /api/admin/email/templates?id=xxx — Delete a template
 */
export async function GET() {
    const authError = await requireApiAdmin();
    if (authError) return authError;

    try {
        const templates = await prisma.emailTemplate.findMany({
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                name: true,
                subject: true,
                body: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        return NextResponse.json({ success: true, templates });
    } catch (error) {
        console.error('[Admin Email Templates] Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch templates' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const authError = await requireApiAdmin();
    if (authError) return authError;

    try {
        const { id, name, subject, body } = await req.json();

        if (!name || !subject || !body) {
            return NextResponse.json(
                { success: false, error: 'name, subject, and body are required' },
                { status: 400 }
            );
        }

        let template;
        if (id) {
            // Update existing
            template = await prisma.emailTemplate.update({
                where: { id },
                data: { name, subject, body },
            });
        } else {
            // Create new
            template = await prisma.emailTemplate.create({
                data: { name, subject, body },
            });
        }

        return NextResponse.json({ success: true, template });
    } catch (error) {
        console.error('[Admin Email Templates] Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to save template' }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    const authError = await requireApiAdmin();
    if (authError) return authError;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ success: false, error: 'Template ID required' }, { status: 400 });
    }

    try {
        await prisma.emailTemplate.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Admin Email Templates] Delete error:', error);
        return NextResponse.json({ success: false, error: 'Failed to delete template' }, { status: 500 });
    }
}
