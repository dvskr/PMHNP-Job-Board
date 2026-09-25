import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import {
    collectAdminFields,
    isRecordNotFound,
    type AdminFieldSpec,
} from '../../_lib/field-validation';
import { BLOG_POST_STATUSES } from '../_lib/blog-fields';

const BLOG_FIELD_SPECS: Record<string, AdminFieldSpec> = {
    title: { kind: 'requiredText' },
    content: { kind: 'requiredText' },
    // Status is a closed set. An arbitrary string was stored verbatim, leaving
    // the post neither draft nor published: invisible on the public blog AND
    // in the admin status filter, so nobody could find it to fix it.
    status: { kind: 'requiredText', oneOf: BLOG_POST_STATUSES },
    // Category is deliberately NOT range-checked on edit. Rows predating
    // BLOG_CATEGORIES carry values outside that list, and the edit form echoes
    // whatever the row holds, so an enum here would make legacy posts
    // uneditable. An off-list category only costs a filter chip; an off-list
    // status hides the post entirely. New posts do get the enum (POST below).
    category: { kind: 'requiredText' },
    metaDescription: { kind: 'text', nullable: true },
    targetKeyword: { kind: 'text', nullable: true },
    imageUrl: { kind: 'text', nullable: true },
};

/**
 * GET /api/admin/blog/:id
 * Get a single blog post with full content for editing.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const post = await prisma.blogPost.findUnique({ where: { id } });
        if (!post) {
            return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true, post });
    } catch (error) {
        console.error('[Admin Blog] GET/:id error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch post' }, { status: 500 });
    }
}

/**
 * PUT /api/admin/blog/:id
 * Update blog post.
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const body = await request.json();
        const collected = collectAdminFields(body, BLOG_FIELD_SPECS);
        if (!collected.ok) {
            return NextResponse.json({ success: false, error: collected.error }, { status: 400 });
        }
        const data = collected.data;

        if (Object.keys(data).length === 0) {
            return NextResponse.json({ success: false, error: 'No valid fields provided' }, { status: 400 });
        }

        // Auto-set publishDate when publishing
        if (data.status === 'published') {
            const existing = await prisma.blogPost.findUnique({
                where: { id },
                select: { publishDate: true },
            });
            if (!existing?.publishDate) {
                data.publishDate = new Date();
            }
        }

        const post = await prisma.blogPost.update({
            where: { id },
            data,
        });

        return NextResponse.json({ success: true, post });
    } catch (error) {
        if (isRecordNotFound(error)) {
            return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
        }
        console.error('[Admin Blog] PUT error:', error);
        return NextResponse.json({ success: false, error: 'Failed to update post' }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/blog/:id
 * Delete blog post.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        await prisma.blogPost.delete({ where: { id } });
        return NextResponse.json({ success: true, action: 'deleted' });
    } catch (error) {
        if (isRecordNotFound(error)) {
            return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
        }
        console.error('[Admin Blog] DELETE error:', error);
        return NextResponse.json({ success: false, error: 'Failed to delete post' }, { status: 500 });
    }
}
