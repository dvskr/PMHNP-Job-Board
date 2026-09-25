import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { collectAdminFields, type AdminFieldSpec } from '../_lib/field-validation';
import { BLOG_POST_CATEGORIES, BLOG_POST_STATUSES } from './_lib/blog-fields';

/**
 * Creation accepts the same shape as the editor, with two differences from the
 * PUT handler: title/content/category are mandatory (checked after collection,
 * since collectAdminFields only types the keys that are present), and category
 * IS range-checked. A brand-new post has no legacy excuse for a category the
 * blog cannot label or filter on.
 */
const NEW_POST_FIELD_SPECS: Record<string, AdminFieldSpec> = {
    title: { kind: 'requiredText' },
    content: { kind: 'requiredText' },
    category: { kind: 'requiredText', oneOf: BLOG_POST_CATEGORIES },
    status: { kind: 'requiredText', oneOf: BLOG_POST_STATUSES },
    metaDescription: { kind: 'text', nullable: true },
    targetKeyword: { kind: 'text', nullable: true },
    imageUrl: { kind: 'text', nullable: true },
};

/**
 * GET /api/admin/blog
 * List all blog posts from DB.
 */
export async function GET(request: NextRequest) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    try {
        const posts = await prisma.blogPost.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                slug: true,
                category: true,
                status: true,
                metaDescription: true,
                targetKeyword: true,
                imageUrl: true,
                publishDate: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return NextResponse.json({ success: true, posts });
    } catch (error) {
        console.error('[Admin Blog] GET error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch posts' }, { status: 500 });
    }
}

/**
 * POST /api/admin/blog
 * Create a new blog post via admin panel.
 */
export async function POST(request: NextRequest) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const collected = collectAdminFields(body, NEW_POST_FIELD_SPECS);
        if (!collected.ok) {
            return NextResponse.json({ success: false, error: collected.error }, { status: 400 });
        }
        const { title, content, category, status, metaDescription, targetKeyword, imageUrl } =
            collected.data as {
                title?: string; content?: string; category?: string; status?: string;
                metaDescription?: string | null; targetKeyword?: string | null; imageUrl?: string | null;
            };

        if (!title || !content || !category) {
            return NextResponse.json(
                { success: false, error: 'title, content, and category are required' },
                { status: 400 },
            );
        }

        // Generate slug
        const baseSlug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 80);
        const slug = `${baseSlug}-${Date.now().toString(36)}`;

        const post = await prisma.blogPost.create({
            data: {
                title,
                slug,
                content,
                category,
                status: status || 'draft',
                metaDescription: metaDescription || null,
                targetKeyword: targetKeyword || null,
                imageUrl: imageUrl || null,
                publishDate: status === 'published' ? new Date() : null,
            },
        });

        return NextResponse.json({ success: true, post }, { status: 201 });
    } catch (error) {
        console.error('[Admin Blog] POST error:', error);
        return NextResponse.json({ success: false, error: 'Failed to create post' }, { status: 500 });
    }
}
