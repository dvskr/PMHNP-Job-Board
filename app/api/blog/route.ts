import { NextRequest, NextResponse } from 'next/server';
import {
    createBlogPost,
    generateUniqueSlug,
    BlogCategory,
} from '@/lib/blog';

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

// ─── Google Indexing API ─────────────────────────────────────────────────────

async function pingGoogleIndexing(url: string): Promise<void> {
    const credentialsRaw = process.env.GOOGLE_INDEXING_CREDENTIALS;
    if (!credentialsRaw) {
        console.log('[Blog API] GOOGLE_INDEXING_CREDENTIALS not set, skipping indexing ping');
        return;
    }

    try {
        // Support both raw JSON and base64-encoded JSON
        let credentials;
        try {
            credentials = JSON.parse(credentialsRaw);
        } catch {
            // If raw JSON parse fails, try base64 decoding
            credentials = JSON.parse(Buffer.from(credentialsRaw, 'base64').toString('utf-8'));
        }
        const now = Math.floor(Date.now() / 1000);

        // Create JWT for Google API authentication
        const header = { alg: 'RS256', typ: 'JWT' };
        const claimSet = {
            iss: credentials.client_email,
            scope: 'https://www.googleapis.com/auth/indexing',
            aud: 'https://oauth2.googleapis.com/token',
            exp: now + 3600,
            iat: now,
        };

        // Base64url encode
        const b64url = (obj: object) =>
            Buffer.from(JSON.stringify(obj))
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

        const signatureInput = `${b64url(header)}.${b64url(claimSet)}`;

        // Sign with RSA key
        const crypto = await import('crypto');
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(signatureInput);
        const signature = sign
            .sign(credentials.private_key, 'base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const jwt = `${signatureInput}.${signature}`;

        // Exchange JWT for access token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
        });

        if (!tokenResponse.ok) {
            console.error('[Blog API] Failed to get Google access token:', await tokenResponse.text());
            return;
        }

        const { access_token } = await tokenResponse.json();

        // Ping Indexing API
        const indexResponse = await fetch(
            'https://indexing.googleapis.com/v3/urlNotifications:publish',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${access_token}`,
                },
                body: JSON.stringify({
                    url,
                    type: 'URL_UPDATED',
                }),
            }
        );

        if (indexResponse.ok) {
            console.log(`[Blog API] Successfully pinged Google Indexing API for: ${url}`);
        } else {
            console.error(
                '[Blog API] Google Indexing API error:',
                await indexResponse.text()
            );
        }
    } catch (error) {
        console.error('[Blog API] Error pinging Google Indexing API:', error);
    }
}

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
        const post = await createBlogPost({
            title,
            slug,
            content,
            meta_description: meta_description || null,
            target_keyword: target_keyword || null,
            category,
            status: postStatus,
            publish_date: publish_date || (postStatus === 'published' ? new Date().toISOString() : null),
        });

        // If published, ping Google Indexing API
        if (postStatus === 'published') {
            const postUrl = `https://pmhnphiring.com/blog/${slug}`;
            // Fire and forget — don't block the response
            pingGoogleIndexing(postUrl).catch((err) =>
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
        console.error('[Blog API] Error creating post:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
