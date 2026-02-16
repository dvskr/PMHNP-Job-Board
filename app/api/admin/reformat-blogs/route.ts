import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { formatBlogContent } from '@/lib/blog-formatter';

/**
 * POST /api/admin/reformat-blogs
 * Re-formats all existing blog post content using the auto-formatter.
 * Requires BLOG_API_KEY for auth (same as blog creation).
 */
export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('Authorization');
    const apiKey = process.env.BLOG_API_KEY;

    if (!apiKey || authHeader?.replace('Bearer ', '') !== apiKey) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Optionally target a specific slug, and optionally supply original content to restore
    const body = await request.json().catch(() => ({}));
    const targetSlug = body.slug;
    const originalContent = body.original_content; // If provided, replaces content before formatting

    let query = supabase.from('blog_posts').select('id, slug, content');
    if (targetSlug) {
        query = query.eq('slug', targetSlug);
    }

    const { data: posts, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results = [];

    for (const post of posts || []) {
        // Use original_content if provided, otherwise use existing content
        const contentToFormat = originalContent || post.content;
        const formatted = formatBlogContent(contentToFormat);

        // Only update if content actually changed
        if (formatted !== post.content) {
            const { error: updateError } = await supabase
                .from('blog_posts')
                .update({ content: formatted })
                .eq('id', post.id);

            results.push({
                slug: post.slug,
                updated: !updateError,
                error: updateError?.message || null,
            });
        } else {
            results.push({ slug: post.slug, updated: false, reason: 'no changes' });
        }
    }

    return NextResponse.json({ success: true, results });
}
