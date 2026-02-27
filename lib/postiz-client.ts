/**
 * Postiz Public API Client
 *
 * Thin wrapper for scheduling social media posts via the Postiz API.
 * Docs: https://docs.postiz.com/public-api/introduction
 */

const POSTIZ_BASE_URL = 'https://api.postiz.com/public/v1';

function getApiKey(): string {
    const key = process.env.POSTIZ_API_KEY;
    if (!key) throw new Error('[Postiz] POSTIZ_API_KEY env var is not set');
    return key;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostizImage {
    id: string;
    path: string;
}

export interface PostizUploadResponse {
    id: string;
    path: string;
}

interface PostizPostValue {
    content: string;
    image: PostizImage[];
}

interface PostizPostEntry {
    integration: { id: string };
    value: PostizPostValue[];
    settings: Record<string, unknown>;
}

interface PostizCreatePostPayload {
    type: 'now' | 'schedule';
    date: string;
    shortLink: boolean;
    tags: string[];
    posts: PostizPostEntry[];
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

async function postizFetch<T>(
    path: string,
    options: RequestInit = {},
): Promise<T> {
    const url = `${POSTIZ_BASE_URL}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: getApiKey(),
            ...(options.headers ?? {}),
        },
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`[Postiz] ${res.status} ${res.statusText}: ${body}`);
    }

    return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Upload an image buffer to Postiz so it can be referenced in posts.
 * Returns { id, path } where path contains "uploads.postiz.com".
 */
export async function uploadImage(
    buffer: Buffer,
    filename: string,
): Promise<PostizUploadResponse> {
    const uint8 = new Uint8Array(buffer);
    const blob = new Blob([uint8], { type: 'image/png' });
    const form = new FormData();
    form.append('file', blob, filename);

    const url = `${POSTIZ_BASE_URL}/upload`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: getApiKey() },
        body: form,
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`[Postiz] Upload failed ${res.status}: ${body}`);
    }

    return res.json() as Promise<PostizUploadResponse>;
}

/**
 * Create (schedule or publish) a post via the Postiz API.
 */
export async function createPost(
    payload: PostizCreatePostPayload,
): Promise<unknown> {
    return postizFetch('/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

/**
 * Convenience: post a text + optional image to a Facebook Page.
 * If an image is provided, it will be attached instead of a link preview.
 */
export async function postToFacebook(
    integrationId: string,
    content: string,
    image?: PostizImage,
): Promise<unknown> {
    return createPost({
        type: 'now',
        date: new Date().toISOString(),
        shortLink: false,
        tags: [],
        posts: [
            {
                integration: { id: integrationId },
                value: [{ content, image: image ? [image] : [] }],
                settings: { __type: 'facebook' },
            },
        ],
    });
}

/**
 * Convenience: post a carousel of images to Instagram.
 * Each image must have been uploaded first via `uploadImage()`.
 */
export async function postToInstagramCarousel(
    integrationId: string,
    content: string,
    images: PostizImage[],
): Promise<unknown> {
    return createPost({
        type: 'now',
        date: new Date().toISOString(),
        shortLink: false,
        tags: [],
        posts: [
            {
                integration: { id: integrationId },
                value: [{ content, image: images }],
                settings: {
                    __type: 'instagram',
                    post_type: 'carousel',
                    is_trial_reel: false,
                    collaborators: [],
                },
            },
        ],
    });
}
