import { NextRequest, NextResponse } from 'next/server';
import {
    createBlogPost,
    generateUniqueSlug,
    SlugCollisionError,
    BlogCategory,
} from '@/lib/blog';
import { formatBlogContent } from '@/lib/blog-formatter';
import { pingAllSearchEngines } from '@/lib/search-indexing';
import { rateLimit } from '@/lib/rate-limit';
import { timingSafeEqual } from 'crypto';
import { readJsonBody } from '@/app/api/_lib/json-body';

/** YouTube video ids are exactly 11 chars of [A-Za-z0-9_-]. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** http(s) only: the value ends up in an <img src> and in feed markup. */
function isHttpUrl(value: string): boolean {
    try {
        const u = new URL(value);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

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
    'mental_health_trends',
    'policy_industry',
    'career_opportunities',
    'tech_tools',
];

const VALID_STATUSES = ['draft', 'published'] as const;

/**
 * Shape the n8n pipeline posts. Declared, not enforced: every field below is
 * still range-checked at runtime (category against VALID_CATEGORIES, status
 * against VALID_STATUSES, title/content for presence). The interface exists so
 * the handler stops being implicitly `any` now that the body is parsed up
 * front, not as a substitute for those checks.
 */
interface BlogCreateBody {
    title?: string;
    content?: string;
    meta_description?: string;
    target_keyword?: string;
    category?: BlogCategory;
    status?: (typeof VALID_STATUSES)[number];
    publish_date?: string;
    format?: boolean;
    image_url?: string;
    youtube_video_id?: string;
}

/**
 * Constant-time bearer-key check, shared by POST and PATCH.
 *
 * It lived inline in POST only, so PATCH compared the same shared secret with
 * `providedKey !== apiKey`, which short-circuits on the first differing byte.
 * Two handlers guarding one secret should not disagree about how they compare
 * it, and the copy that got it wrong was also the unthrottled one.
 *
 * Returns a NextResponse to send immediately, or null when the key is good.
 */
function verifyBlogApiKey(request: NextRequest): NextResponse | null {
    const apiKey = process.env.BLOG_API_KEY;
    if (!apiKey) {
        return NextResponse.json(
            { error: 'BLOG_API_KEY not configured on server' },
            { status: 500 }
        );
    }

    const providedKey = request.headers.get('Authorization')?.replace('Bearer ', '') || '';
    // Length is compared first because timingSafeEqual throws on unequal
    // buffer lengths. Key length is not the secret.
    const keysMatch = providedKey.length === apiKey.length &&
        timingSafeEqual(Buffer.from(providedKey), Buffer.from(apiKey));

    if (!keysMatch) {
        return NextResponse.json(
            { error: 'Unauthorized: invalid or missing API key' },
            { status: 401 }
        );
    }

    return null;
}

// ─── POST /api/blog ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'blog-api', {
        limit: 5,
        windowSeconds: 60,
    });
    if (rateLimitResult) return rateLimitResult;

    // Verify API key (timing-safe comparison)
    const authError = verifyBlogApiKey(request);
    if (authError) return authError;

    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;

    try {
        // Validate required fields
        const { title, content, meta_description, target_keyword, category, status, publish_date, format, image_url, youtube_video_id } =
            parsed.body as BlogCreateBody;

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

        // Generate unique slug. Throws SlugCollisionError on a duplicate
        // submission (GSC Fix P2.12) — surfaced as 409 so the pipeline
        // (n8n) sees an explicit failure instead of silently publishing a
        // "-2" twin that splits ranking signals with the original.
        let slug: string;
        try {
            slug = await generateUniqueSlug(title);
        } catch (err) {
            if (err instanceof SlugCollisionError) {
                return NextResponse.json(
                    { error: err.message, existingSlug: err.slug },
                    { status: 409 }
                );
            }
            throw err;
        }

        // Create the post
        // Only auto-format if explicitly requested (format: true)
        // OpenAI already produces clean markdown, so default is no formatting
        const finalContent = format ? formatBlogContent(content) : content;

        // Convert Google Drive viewer URLs to direct image URLs
        let finalImageUrl: string | null = null;
        if (image_url) {
            const driveMatch = image_url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
            if (driveMatch) {
                finalImageUrl = `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
            } else {
                finalImageUrl = image_url;
            }
        }

        const post = await createBlogPost({
            title,
            slug,
            content: finalContent,
            meta_description: meta_description || null,
            target_keyword: target_keyword || null,
            image_url: finalImageUrl,
            youtube_video_id: youtube_video_id || null,
            video_url: null,
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
        // Logged in full, returned generic: the underlying message names
        // tables, columns and constraints to whoever holds the key.
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Blog API] Error creating post:', message);
        return NextResponse.json(
            { error: 'Failed to create blog post' },
            { status: 500 }
        );
    }
}

// ─── PATCH /api/blog ─────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
    // Same throttle as POST: this handler guards the same shared secret, so
    // leaving it unthrottled made it the cheaper of the two to attack.
    const rateLimitResult = await rateLimit(request, 'blog-api', {
        limit: 5,
        windowSeconds: 60,
    });
    if (rateLimitResult) return rateLimitResult;

    const authError = verifyBlogApiKey(request);
    if (authError) return authError;

    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;

    try {
        const { slug, youtube_video_id, image_url } = parsed.body as {
            slug?: unknown;
            youtube_video_id?: unknown;
            image_url?: unknown;
        };
        if (!slug || typeof slug !== 'string') {
            return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
        }

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Both columns are rendered later without escaping: youtube_video_id
        // is interpolated into the <video:player_loc> URL in
        // app/video-sitemap.xml/route.ts, and image_url into post markup.
        // Validate the shape here, at the boundary, rather than trusting the
        // automation that holds the key.
        const updates: Record<string, string | null> = {};

        if (youtube_video_id !== undefined) {
            if (youtube_video_id === null || youtube_video_id === '') {
                updates.youtube_video_id = null;
            } else if (typeof youtube_video_id === 'string' && YOUTUBE_ID.test(youtube_video_id)) {
                updates.youtube_video_id = youtube_video_id;
            } else {
                return NextResponse.json(
                    { error: 'youtube_video_id must be an 11-character YouTube id, or null to clear it' },
                    { status: 400 }
                );
            }
        }

        if (image_url !== undefined) {
            if (image_url === null || image_url === '') {
                updates.image_url = null;
            } else if (typeof image_url === 'string' && isHttpUrl(image_url)) {
                updates.image_url = image_url;
            } else {
                return NextResponse.json(
                    { error: 'image_url must be an http(s) URL, or null to clear it' },
                    { status: 400 }
                );
            }
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('blog_posts')
            .update(updates)
            .eq('slug', slug)
            .select('id, slug, youtube_video_id, image_url')
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, post: data });
    } catch (error) {
        // Log the detail, return a generic body: the raw Supabase/Prisma
        // message names tables, columns and constraints to whoever called.
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Blog API] Error updating post:', message);
        return NextResponse.json({ error: 'Failed to update blog post' }, { status: 500 });
    }
}
