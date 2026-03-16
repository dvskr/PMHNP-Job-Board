import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';

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
        const { title, content, category, status, metaDescription, targetKeyword, imageUrl } = body;

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
