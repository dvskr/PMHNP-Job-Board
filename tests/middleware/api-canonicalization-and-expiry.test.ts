/**
 * Two middleware rules that were applied to the wrong requests.
 *
 *  1. The SEO canonicalization redirects (strip ?page=1, strip utm_*) ran on
 *     /api/* as well as on pages. A JSON endpoint has no canonical to
 *     consolidate: the talent pool's first fetch (?page=1&limit=20) paid an
 *     extra round trip on every load, and a 301 on a non-GET call downgrades
 *     it to GET and drops its body.
 *
 *  2. The job-detail 410 gate read a null expires_at as "never expires", while
 *     app/jobs/[slug] treats it as originalPostedAt + 60 days and 404s past
 *     that. The URL stayed in the sitemaps, answered 404 forever, and never
 *     got the 410 that tells Google to drop it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/supabase/middleware', () => ({
    updateSession: vi.fn(async () => NextResponse.next()),
}));

vi.mock('@/lib/rate-limit', () => ({
    rateLimit: vi.fn(async () => null),
    RATE_LIMITS: {
        publicDetail: { limit: 100, windowSeconds: 60 },
        publicListing: { limit: 100, windowSeconds: 60 },
        publicCompany: { limit: 100, windowSeconds: 60 },
    },
}));

const ORIGIN = 'https://pmhnphiring.com';

async function run(pathAndQuery: string, method = 'GET') {
    const { middleware } = await import('@/middleware');
    const { NextRequest } = await import('next/server');
    return middleware(new NextRequest(new URL(pathAndQuery, ORIGIN), { method }));
}

describe('SEO canonicalization skips API routes', () => {
    beforeEach(() => {
        delete process.env.INDEXNOW_API_KEY;
        delete process.env.INDEXNOW_KEY;
    });

    it('serves an API GET carrying page=1 directly instead of 301ing it', async () => {
        const res = await run('/api/employer/candidates?page=1&limit=5');
        expect(res.status).not.toBe(301);
        expect(res.headers.get('location')).toBeNull();
    });

    it('does not 301 an API request carrying utm params', async () => {
        const res = await run('/api/jobs?utm_source=google_jobs_apply&page=1');
        expect(res.status).not.toBe(301);
        expect(res.headers.get('location')).toBeNull();
    });

    it('still strips page=1 on a crawlable listing URL', async () => {
        const res = await run('/jobs/remote?page=1');
        expect(res.status).toBe(301);
        const loc = new URL(res.headers.get('location') as string);
        expect(loc.pathname).toBe('/jobs/remote');
        expect(loc.searchParams.get('page')).toBeNull();
    });

    it('still strips utm params on a crawlable listing URL', async () => {
        const res = await run('/jobs/remote?utm_source=google_jobs_apply');
        expect(res.status).toBe(301);
        expect(new URL(res.headers.get('location') as string).searchParams.get('utm_source')).toBeNull();
    });
});

describe('a null expires_at means posted + 60 days, not "never"', () => {
    const realFetch = global.fetch;
    const DAY = 24 * 60 * 60 * 1000;

    /** Distinct id per case: middleware memoizes the gone/live verdict per job. */
    const jobUrl = (n: number) => `/jobs/psych-np-0000000${n}-0000-4000-8000-00000000000${n}`;

    const serveRow = (row: Record<string, unknown>) => {
        global.fetch = vi.fn(async () => ({
            ok: true,
            json: async () => [row],
        })) as unknown as typeof fetch;
    };

    beforeEach(() => {
        delete process.env.INDEXNOW_API_KEY;
        delete process.env.INDEXNOW_KEY;
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    });

    afterEach(() => {
        global.fetch = realFetch;
    });

    it('410s a published job with no expiry that was posted more than 60 days ago', async () => {
        serveRow({
            id: 'x',
            is_published: true,
            expires_at: null,
            original_posted_at: new Date(Date.now() - 90 * DAY).toISOString(),
            created_at: new Date(Date.now() - 90 * DAY).toISOString(),
        });
        const res = await run(jobUrl(1));
        expect(res.status).toBe(410);
    });

    it('leaves a published job with no expiry inside the 60-day window alone', async () => {
        serveRow({
            id: 'x',
            is_published: true,
            expires_at: null,
            original_posted_at: new Date(Date.now() - 5 * DAY).toISOString(),
            created_at: new Date(Date.now() - 5 * DAY).toISOString(),
        });
        const res = await run(jobUrl(2));
        expect(res.status).not.toBe(410);
    });

    it('falls back to created_at when the posting never carried an original date', async () => {
        serveRow({
            id: 'x',
            is_published: true,
            expires_at: null,
            original_posted_at: null,
            created_at: new Date(Date.now() - 120 * DAY).toISOString(),
        });
        const res = await run(jobUrl(3));
        expect(res.status).toBe(410);
    });

    it('still 410s on an expiry date that has passed', async () => {
        serveRow({
            id: 'x',
            is_published: true,
            expires_at: new Date(Date.now() - DAY).toISOString(),
            original_posted_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
        });
        const res = await run(jobUrl(4));
        expect(res.status).toBe(410);
    });

    it('asks Supabase for the dates it now needs to decide', async () => {
        serveRow({
            id: 'x',
            is_published: true,
            expires_at: null,
            original_posted_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
        });
        await run(jobUrl(5));
        const requested = String((global.fetch as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]);
        expect(requested).toContain('original_posted_at');
        expect(requested).toContain('created_at');
    });
});

describe('the CCPA/DSAR forms are noindex and carry their own metadata', () => {
    beforeEach(() => {
        delete process.env.INDEXNOW_API_KEY;
        delete process.env.INDEXNOW_KEY;
    });

    // Both are 'use client' pages linked from the footer of every page. With no
    // metadata of their own they inherited the ROOT title, description and
    // og:url, so a crawler saw two indexable URLs byte-identical to the
    // homepage. The header and the meta tag have to agree, so the middleware
    // list is half of the fix and the segment layout is the other half.
    for (const path of ['/data-request', '/do-not-sell']) {
        it(`sends X-Robots-Tag: noindex for ${path}`, async () => {
            const res = await run(path);
            expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
        });
    }

    it('/data-request declares its own title, canonical and robots directive', async () => {
        const fs = await import('node:fs');
        const pathMod = await import('node:path');
        const src = fs.readFileSync(
            pathMod.resolve(__dirname, '../../app/data-request/layout.tsx'),
            'utf8',
        );
        expect(src).toMatch(/title:\s*'Privacy Data Request'/);
        expect(src).toContain('/data-request');
        expect(src).toMatch(/robots:\s*\{\s*index:\s*false/);
        // Not the homepage description.
        expect(src).not.toMatch(/Browse thousands of PMHNP jobs/);
    });
});

describe('the consent-region cookie is written only when it changes', () => {
    // A Set-Cookie header makes the response un-cacheable at the CDN. Re-sending
    // a value the browser already carries bought nothing and cost every repeat
    // human page view its cacheability. lib/consent.ts defaults to 'strict'
    // when the cookie is absent, so skipping an unchanged write is safe.
    async function get(cookie?: string) {
        const { middleware } = await import('@/middleware');
        const { NextRequest } = await import('next/server');
        const req = new NextRequest(new URL('/jobs/remote', ORIGIN), {
            method: 'GET',
            headers: cookie ? { cookie } : undefined,
        });
        return middleware(req);
    }

    it('sets it on a first visit, when the browser carries none', async () => {
        const res = await get();
        expect(res.headers.get('set-cookie') ?? '').toContain('pmhnp_consent_region');
    });

    it('does not resend it when the browser already carries the same region', async () => {
        const res = await get('pmhnp_consent_region=strict');
        expect(res.headers.get('set-cookie') ?? '').not.toContain('pmhnp_consent_region');
    });

    it('does resend it when the carried region disagrees', async () => {
        const res = await get('pmhnp_consent_region=implied');
        expect(res.headers.get('set-cookie') ?? '').toContain('pmhnp_consent_region=strict');
    });
});
