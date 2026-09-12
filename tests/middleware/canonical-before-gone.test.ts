/**
 * Middleware routing order regressions.
 *
 * Two bugs lived at the top of middleware():
 *
 *  1. The trailing-slash and case-normalization 301s ran AFTER every /jobs/*
 *     410 gate. Those gates match raw path segments against lowercase,
 *     unslashed allowlists, so /jobs/Remote and /jobs/remote/New-York were
 *     answered with a permanent 410 instead of a redirect to the canonical
 *     URL that resolves perfectly well.
 *
 *  2. The IndexNow verification key was served by app/[indexnow]/route.ts. A
 *     top-level [param] segment outranks [...catchall], so that Route Handler
 *     intercepted every unknown single-segment URL and answered notFound(),
 *     which inside a Route Handler is a bodyless 404 that can never render
 *     app/not-found.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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

async function run(pathname: string) {
    const { middleware } = await import('@/middleware');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest(new URL(pathname, ORIGIN), { method: 'GET' });
    return middleware(req);
}

const locationPath = (res: Response) => {
    const loc = res.headers.get('location');
    return loc ? new URL(loc).pathname : null;
};

describe('canonical URL shape is settled before the 410 gates', () => {
    beforeEach(() => {
        delete process.env.INDEXNOW_API_KEY;
        delete process.env.INDEXNOW_KEY;
    });

    it('301s a capitalized category instead of burying it under a 410', async () => {
        const res = await run('/jobs/Remote');
        expect(res.status).toBe(301);
        expect(locationPath(res)).toBe('/jobs/remote');
    });

    it('301s a capitalized state slug instead of 410ing an unresolvable state', async () => {
        const res = await run('/jobs/remote/New-York');
        expect(res.status).toBe(301);
        expect(locationPath(res)).toBe('/jobs/remote/new-york');
    });

    it('301s a capitalized category on a city-shaped URL', async () => {
        const res = await run('/jobs/Remote/city/austin-tx');
        expect(res.status).toBe(301);
        expect(locationPath(res)).toBe('/jobs/remote/city/austin-tx');
    });

    it('301s a trailing slash to the unslashed path, not back to itself', async () => {
        const res = await run('/jobs/remote/');
        expect(res.status).toBe(301);
        // NextURL remembers the incoming trailing slash and re-appends it when
        // it formats href, so a naive `url.pathname = ...` assignment here
        // produced an infinite redirect loop.
        expect(locationPath(res)).toBe('/jobs/remote');
    });

    it('preserves the query string when stripping a trailing slash', async () => {
        const res = await run('/jobs/remote/?page=2');
        expect(res.status).toBe(301);
        const loc = new URL(res.headers.get('location') as string);
        expect(loc.pathname).toBe('/jobs/remote');
        expect(loc.searchParams.get('page')).toBe('2');
    });

    it('still 410s a genuinely unknown taxonomy', async () => {
        const res = await run('/jobs/zzz-not-a-category');
        expect(res.status).toBe(410);
    });

    it('still 410s a genuinely unknown state on a valid category', async () => {
        const res = await run('/jobs/remote/not-a-state');
        expect(res.status).toBe(410);
    });

    it('still 410s an unknown city slug on a valid category', async () => {
        const res = await run('/jobs/remote/city/not-a-real-city');
        expect(res.status).toBe(410);
    });
});

describe('IndexNow key is served from the edge, not a dynamic page segment', () => {
    beforeEach(() => {
        delete process.env.INDEXNOW_API_KEY;
        delete process.env.INDEXNOW_KEY;
    });

    it('serves the key as text/plain at /{key}.txt', async () => {
        process.env.INDEXNOW_API_KEY = 'abcdef0123456789abcdef0123456789';
        const res = await run('/abcdef0123456789abcdef0123456789.txt');
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/plain');
        await expect(res.text()).resolves.toBe('abcdef0123456789abcdef0123456789');
    });

    it('serves the key at the bare /{key} path too', async () => {
        process.env.INDEXNOW_KEY = 'abcdef0123456789abcdef0123456789';
        const res = await run('/abcdef0123456789abcdef0123456789');
        expect(res.status).toBe(200);
        await expect(res.text()).resolves.toBe('abcdef0123456789abcdef0123456789');
    });

    it('lets an unrelated single-segment URL fall through to the app router', async () => {
        process.env.INDEXNOW_API_KEY = 'abcdef0123456789abcdef0123456789';
        const res = await run('/zzz-nope');
        // Not short-circuited: middleware hands the request on (no key body,
        // no bodyless 404), so it reaches app/[...catchall]/page.tsx, which
        // renders the branded app/not-found.tsx with a real 404.
        expect(res.status).toBe(200);
        await expect(res.text()).resolves.toBe('');
    });

    it('no [indexnow] dynamic route survives to shadow [...catchall]', () => {
        const shadow = path.join(process.cwd(), 'app', '[indexnow]');
        expect(fs.existsSync(shadow)).toBe(false);
    });
});
