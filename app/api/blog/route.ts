import { NextRequest, NextResponse } from 'next/server';
import {
    createBlogPost,
    generateUniqueSlug,
    BlogCategory,
} from '@/lib/blog';
import { formatBlogContent } from '@/lib/blog-formatter';
import { pingAllSearchEngines } from '@/lib/search-indexing';

const VALID_CATEGORIES: BlogCategory[] = [
    'job_seeker_attraction',
    'salary_negotiation',
    'career_myths',
    'state_spotlight',
    'employer_facing',
    'community_lifestyle',
    'industry_awareness',
    'product_lead_gen',
    'success_stories',
];

const VALID_STATUSES = ['draft', 'published'] as const;

// ─── POST /api/blog ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    // Verify API key
    const authHeader = request.headers.get('Authorization');
    const apiKey = process.env.BLOG_API_KEY;

    if (!apiKey) {
        return NextResponse.json(
            { error: 'BLOG_API_KEY not configured on server' },
            { status: 500 }
        );
    }

    const providedKey = authHeader?.replace('Bearer ', '');
    if (!providedKey || providedKey !== apiKey) {
        return NextResponse.json(
            { error: 'Unauthorized — invalid or missing API key' },
            { status: 401 }
        );
    }

    try {
        const body = await request.json();

        // Validate required fields
        const { title, content, meta_description, target_keyword, category, status, publish_date } =
            body;

        if (!title || !content) {
            return NextResponse.json(
                { error: 'Missing required fields: title, content' },
                { status: 400 }
            );
        }

        if (!category || !VALID_CATEGORIES.includes(category)) {
            return NextResponse.json(
                {
                    error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
                },
                { status: 400 }
            );
        }

        const postStatus = status || 'draft';
        if (!VALID_STATUSES.includes(postStatus)) {
            return NextResponse.json(
                { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
                { status: 400 }
            );
        }

        // Generate unique slug
        const slug = await generateUniqueSlug(title);

        // Create the post
        // Auto-format the markdown content for better readability
        const formattedContent = formatBlogContent(content);

        const post = await createBlogPost({
            title,
            slug,
            content: formattedContent,
            meta_description: meta_description || null,
            target_keyword: target_keyword || null,
            category,
            status: postStatus,
            publish_date: publish_date || (postStatus === 'published' ? new Date().toISOString() : null),
        });

        // If published, ping all search engines (Google, Bing, IndexNow)
        if (postStatus === 'published') {
            const postUrl = `https://pmhnphiring.com/blog/${slug}`;
            // Fire and forget — don't block the response
            pingAllSearchEngines(postUrl).catch((err) =>
                console.error('[Blog API] Background indexing ping failed:', err)
            );
        }

        return NextResponse.json(
            {
                success: true,
                post: {
                    id: post.id,
                    title: post.title,
                    slug: post.slug,
                    category: post.category,
                    status: post.status,
                    publish_date: post.publish_date,
                    url: `https://pmhnphiring.com/blog/${post.slug}`,
                },
            },
            { status: 201 }
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Blog API] Error creating post:', message);
        return NextResponse.json(
            { error: `Failed to create blog post: ${message}` },
            { status: 500 }
        );
    }
}
