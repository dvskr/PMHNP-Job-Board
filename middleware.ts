import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
    // ── UTM Parameter Stripping ──────────────────────────────────────
    // Google Jobs appends ?utm_source=google_jobs_apply&utm_campaign=...
    // to job URLs, creating ~800+ duplicate pages in GSC.
    // Strip all utm_* params and 301 redirect to the clean URL.
    const url = request.nextUrl.clone();
    const paramsToRemove: string[] = [];

    url.searchParams.forEach((_value, key) => {
        if (key.toLowerCase().startsWith('utm_')) {
            paramsToRemove.push(key);
        }
    });

    if (paramsToRemove.length > 0) {
        paramsToRemove.forEach(key => url.searchParams.delete(key));
        return NextResponse.redirect(url, 301);
    }

    // ── Company URL Normalization ─────────────────────────────────────
    // GSC shows ~100 company pages crawled with spaces instead of hyphens
    // (e.g., "/companies/elite dna behavioral" → "/companies/elite-dna-behavioral")
    const pathname = url.pathname;

    if (pathname.startsWith('/companies/') && pathname.includes(' ')) {
        const normalized = pathname.replace(/ +/g, '-').toLowerCase();
        url.pathname = normalized;
        return NextResponse.redirect(url, 301);
    }

    // ── Junk URL Cleanup ──────────────────────────────────────────────
    // Redirect garbage paths that got crawled (/$, /&, /year) to homepage
    const junkPaths = ['/$', '/&', '/year'];
    if (junkPaths.includes(pathname)) {
        url.pathname = '/';
        return NextResponse.redirect(url, 301);
    }

    // Refresh the Supabase session (keeps auth cookies alive)
    const response = await updateSession(request);

    // Security headers are configured in next.config.ts (CSP, HSTS, X-Frame-Options, etc.)
    // No need to duplicate them here.

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all routes except:
         * - _next/static (static files)
         * - _next/image (image optimization)
         * - favicon.ico, sitemap.xml, robots.txt
         * - Public assets
         */
        '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
    ],
};

