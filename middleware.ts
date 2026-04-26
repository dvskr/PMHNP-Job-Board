import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// ── Known Bot User-Agents to Block ────────────────────────────────────────
// These are scraping tools, not legitimate search crawlers.
const BLOCKED_BOT_PATTERNS = [
    /python-requests/i,
    /python-urllib/i,
    /scrapy/i,
    /httpx/i,
    /aiohttp/i,
    /curl\/\d/i,
    /wget/i,
    /phantomjs/i,
    /headlesschrome/i,
    /selenium/i,
    /puppeteer/i,
    /playwright/i,
    /java\/\d/i,
    /go-http-client/i,
    /node-fetch/i,
    /axios/i,
    /undici/i,
];

function isBlockedBot(ua: string): boolean {
    return BLOCKED_BOT_PATTERNS.some(pattern => pattern.test(ua));
}

export async function middleware(request: NextRequest) {
    const url = request.nextUrl.clone();
    const pathname = url.pathname;

    // ── Bot Detection ─────────────────────────────────────────────────
    // Block known scraping tools. Legitimate crawlers (Googlebot, Bingbot)
    // are NOT blocked — only programmatic scraping libraries.
    const userAgent = request.headers.get('user-agent') || '';
    if (isBlockedBot(userAgent)) {
        return new NextResponse('Forbidden', { status: 403 });
    }

    // Block requests with no User-Agent (almost always bots)
    if (!userAgent && pathname.startsWith('/api/')) {
        return new NextResponse('Forbidden', { status: 403 });
    }

    // ── 410 Gone for Deleted/Expired Job URLs ─────────────────────────
    // GSC Fix: Returns HTTP 410 for job detail pages where the job no longer
    // exists or is unpublished. This tells Google to permanently de-index
    // the URL and stop wasting crawl budget recrawling it.
    // Previously returned 404 (via notFound()) which Google keeps recrawling.
    if (pathname.startsWith('/jobs/') && pathname.split('/').length === 3) {
        const slug = pathname.split('/')[2];
        // Only check job detail pages (slugs ending with a UUID)
        const uuidMatch = slug.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
        if (uuidMatch) {
            const jobId = uuidMatch[1];
            try {
                // Lightweight edge-compatible check via Supabase REST API
                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.PROD_SUPABASE_URL;
                const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;
                if (supabaseUrl && supabaseKey) {
                    const res = await fetch(
                        `${supabaseUrl}/rest/v1/jobs?id=eq.${jobId}&select=id,is_published`,
                        {
                            headers: {
                                'apikey': supabaseKey,
                                'Authorization': `Bearer ${supabaseKey}`,
                            },
                        }
                    );
                    if (res.ok) {
                        const rows = await res.json();
                        // Job doesn't exist OR is unpublished → 410 Gone
                        if (rows.length === 0 || !rows[0].is_published) {
                            return new NextResponse(
                                `<!DOCTYPE html><html><head><meta name="robots" content="noindex"><title>Position Removed</title></head><body><h1>410 Gone</h1><p>This job listing has been permanently removed.</p><p><a href="/jobs">Browse current PMHNP jobs</a></p></body></html>`,
                                {
                                    status: 410,
                                    headers: {
                                        'Content-Type': 'text/html',
                                        'X-Robots-Tag': 'noindex, nofollow',
                                        'Cache-Control': 'public, max-age=86400',
                                    },
                                }
                            );
                        }
                    }
                }
            } catch {
                // If DB check fails, fall through to normal page rendering
            }
        }
    }

    // ── CSP Nonce Generation ──────────────────────────────────────────
    // Generate a unique nonce per request for Content-Security-Policy
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

    const isLocalhost = request.headers.get('host')?.includes('localhost');

    // Build CSP with nonce — replaces 'unsafe-inline' for script-src
    const cspDirectives = [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' https://www.googletagmanager.com https://www.google-analytics.com https://js.stripe.com`,
        // style-src keeps 'unsafe-inline' — Next.js injects styles at runtime that can't be nonced
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: blob: https://*.supabase.co https://lh3.googleusercontent.com https://www.google-analytics.com https://www.googletagmanager.com",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self' https://*.supabase.co https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://api.resend.com https://*.upstash.io https://api.stripe.com",
        "frame-src 'self' https://js.stripe.com https://www.youtube.com",
        "media-src 'self' https://*.supabase.co",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ];

    // Only upgrade insecure requests in production (breaks localhost fetch)
    if (!isLocalhost) {
        cspDirectives.push("upgrade-insecure-requests");
    }

    const cspHeader = cspDirectives.join('; ');

    // ── Trailing Slash Stripping ─────────────────────────────────────
    // Fixes "Duplicate, Google chose different canonical than user" GSC issue.
    // /jobs/remote/ and /jobs/remote are the same page but different URLs.
    // Enforce no-trailing-slash for all non-root paths.

    if (pathname !== '/' && pathname.endsWith('/')) {
        url.pathname = pathname.slice(0, -1);
        return NextResponse.redirect(url, 301);
    }

    // ── URL Case Normalization ────────────────────────────────────────
    // GSC Fix: /jobs/Remote and /jobs/remote are different URLs to Google.
    // 301 redirect any path containing uppercase letters to its lowercase
    // equivalent. Excludes _next/ paths and API routes with tokens.
    if (/[A-Z]/.test(pathname) && !pathname.startsWith('/_next')) {
        url.pathname = pathname.toLowerCase();
        return NextResponse.redirect(url, 301);
    }

    // ── Page=1 Stripping ─────────────────────────────────────────────
    // GSC Fix: /jobs/remote?page=1 is a duplicate of /jobs/remote.
    // Strip ?page=1 to consolidate canonical authority.
    if (url.searchParams.get('page') === '1') {
        url.searchParams.delete('page');
        return NextResponse.redirect(url, 301);
    }

    // ── UTM Parameter Stripping ──────────────────────────────────────
    // Google Jobs appends ?utm_source=google_jobs_apply&utm_campaign=...
    // to job URLs, creating ~800+ duplicate pages in GSC.
    // Strip all utm_* params and 301 redirect to the clean URL.
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
    if (pathname.startsWith('/companies/') && pathname.includes(' ')) {
        const normalized = pathname.replace(/ +/g, '-').toLowerCase();
        url.pathname = normalized;
        return NextResponse.redirect(url, 301);
    }

    // ── Junk URL Cleanup ──────────────────────────────────────────────
    // Redirect only specific garbage paths that got crawled to homepage
    // NOTE: Do NOT use broad regex here — /_next/data/ starts with non-letter
    // and would get caught, breaking Next.js client-side navigation.
    const junkPaths = ['/$', '/&', '/year', '/undefined', '/null', '/%24', '/%26'];
    if (junkPaths.includes(pathname)) {
        url.pathname = '/';
        return NextResponse.redirect(url, 301);
    }

    // GSC Fix: Catch malformed job URLs with "undefined" in the slug
    // These generate 404s in GSC (e.g., /jobs/undefined-undefined-GUID)
    if (pathname.startsWith('/jobs/undefined') || pathname.startsWith('/jobs/null')) {
        url.pathname = '/jobs';
        return NextResponse.redirect(url, 301);
    }

    // Refresh the Supabase session (keeps auth cookies alive)
    const response = await updateSession(request);

    // Set CSP header and pass nonce to layout via request header
    response.headers.set('Content-Security-Policy', cspHeader);
    response.headers.set('x-nonce', nonce);

    // ── CORS Headers for API Routes ──────────────────────────────────
    // Restrict cross-origin API access to only our own domain.
    // Without this, any website can fetch our API and scrape data.
    if (pathname.startsWith('/api/')) {
        const origin = request.headers.get('origin');
        const allowedOrigins = [
            'https://pmhnphiring.com',
            'https://www.pmhnphiring.com',
            process.env.NEXT_PUBLIC_BASE_URL,
            'http://localhost:3000',
            'http://localhost:3001',
        ].filter(Boolean);

        if (origin && allowedOrigins.includes(origin)) {
            response.headers.set('Access-Control-Allow-Origin', origin);
        }
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        response.headers.set('Access-Control-Max-Age', '86400');
    }

    // ── Additional Security Headers ──────────────────────────────────
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // ── REMOVED: Middleware Canonical URL Header ──────────────────────
    // Previously set Link: <canonical>; rel="canonical" HTTP header on every
    // response. REMOVED because it caused 7,236 "Duplicate without canonical"
    // GSC errors. The middleware stripped query params, so /jobs?page=2 and
    // /jobs?sort=newest both got canonical=/jobs — making Google see thousands
    // of "duplicate" pages. All pages already set canonical correctly via
    // alternates.canonical in generateMetadata(). The double signal (HTTP header
    // + HTML tag) was causing conflicts where Google chose its own canonical (617 pages).

    // ── Noindex for Robots.txt-Blocked Paths ────────────────────────
    // GSC Fix: robots.txt only prevents CRAWLING, not INDEXING.
    // Google can still index URLs from internal links even without crawling.
    // Adding X-Robots-Tag: noindex ensures these pages are dropped from the index.
    const noindexPaths = [
        '/login', '/signup', '/forgot-password', '/reset-password',
        '/saved', '/settings', '/email-preferences', '/success',
        '/post-job/checkout', '/post-job/preview',
        '/job-alerts/manage', '/job-alerts/unsubscribe',
        '/unauthorized', '/unsubscribe', '/messages', '/my-applications',
    ];
    const isNoindexPath = noindexPaths.some(p => pathname === p || pathname.startsWith(p + '/'))
        || pathname.startsWith('/employer/')
        || pathname.startsWith('/admin/')
        || pathname.startsWith('/dashboard/')
        || pathname.startsWith('/auth/')
        || pathname.startsWith('/jobs/edit/')
        || (pathname.startsWith('/api/') && !pathname.startsWith('/api/og') && !pathname.startsWith('/api/sitemaps'));
    if (isNoindexPath) {
        response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    }

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

