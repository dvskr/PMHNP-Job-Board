import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { isKnownCitySlug } from '@/lib/pseo/city-data/city-slugs-edge';
import { resolveStateSlug } from '@/lib/pseo/setting-state-config';
import { getAllMetroSlugs } from '@/lib/metro-data';

// ── pSEO Taxonomy Allowlists (P1.2) ────────────────────────────────
// Used to detect structurally invalid pSEO URLs and return 410 instead of 404.
// 410 is a permanent-gone signal that Google de-indexes faster than 404.
//
// Keep in sync with:
//   - state-eligible: app/jobs/{taxonomy}/[state]/page.tsx routes (13 dirs)
//   - city-eligible:  app/jobs/{taxonomy}/city/[slug]/page.tsx routes (28+ dirs)
const STATE_ELIGIBLE_TAXONOMIES = new Set<string>([
    'remote', 'telehealth', 'inpatient', 'outpatient', 'travel',
    'full-time', 'part-time', 'contract',
    'addiction', 'new-grad', '1099', 'behavioral-health', 'correctional',
]);

const CITY_ELIGIBLE_TAXONOMIES = new Set<string>([
    'remote', 'telehealth', 'inpatient', 'outpatient', 'travel',
    'full-time', 'part-time', 'contract',
    'addiction', 'child-adolescent', 'substance-abuse', 'new-grad',
    'per-diem', 'locum-tenens', 'correctional', '1099',
    'behavioral-health',
    'entry-level', 'mid-career', 'senior',
    'hospital', 'private-practice', 'community-health', 'va',
    'geriatric', 'veterans', 'lgbtq', 'crisis',
]);

const METRO_SLUG_SET = new Set<string>(getAllMetroSlugs());

/**
 * Renders a styled HTML 410 Gone response that matches the site's
 * claymorphic design language. Self-contained — no external CSS, no
 * client JS — because middleware can't reach into the React tree, and
 * we still want a real HTTP 410 status (which Next.js Server Components
 * can't easily emit from a regular page render).
 *
 * Crawlers see the proper 410 + noindex; humans get a branded page
 * that doesn't feel like a bare 404 dump.
 */
function styled410(opts: {
    badge: string;
    heading: string;
    subtext: string;
    title?: string; // browser tab title
}): NextResponse {
    const tabTitle = opts.title ?? `${opts.badge} — PMHNP Hiring`;
    const safe = (s: string) => s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${safe(tabTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:wght@600;700;800&display=swap">
<style>
  *,*::before,*::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: #F5F0EB;
    color: #1A2E35;
    font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    line-height: 1.5;
    min-height: 100vh;
  }
  .header {
    max-width: 1360px; margin: 0 auto;
    padding: 24px 24px 0;
    display: flex; align-items: center; gap: 10px;
  }
  .logo-mark {
    width: 36px; height: 36px;
    background: linear-gradient(135deg,#0D9488,#0F766E);
    border-radius: 12px;
    display: inline-flex; align-items: center; justify-content: center;
    color: #fff; font-family: 'Lora', Georgia, serif; font-weight: 800;
    box-shadow: 4px 4px 10px rgba(13,148,136,0.25), inset 0 1px 0 rgba(255,255,255,0.25);
  }
  .logo-text {
    font-family: 'Lora', Georgia, serif;
    font-size: 20px; font-weight: 700; color: #3D2E24; letter-spacing: -0.01em;
  }
  .logo-text .accent { color: #0D9488; font-style: italic; font-weight: 600; }
  main {
    max-width: 720px; margin: 0 auto;
    padding: 60px 24px 80px;
  }
  .clay-card {
    background: #FFFFFF;
    border-radius: 24px;
    border: 1px solid rgba(255,255,255,0.5);
    box-shadow:
      8px 8px 20px rgba(0,0,0,0.06),
      -3px -3px 10px rgba(255,255,255,0.85),
      inset 1px 1px 2px rgba(255,255,255,0.6),
      inset -1px -1px 1px rgba(0,0,0,0.02);
  }
  .hero {
    padding: 48px 36px;
    text-align: center;
    margin-bottom: 24px;
  }
  .badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 18px; border-radius: 999px;
    font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
    background: linear-gradient(135deg,#6B7280,#4B5563);
    color: #fff;
    box-shadow: 0 4px 10px rgba(75,85,99,0.20), inset 0 1px 0 rgba(255,255,255,0.20);
  }
  h1 {
    font-family: 'Lora', Georgia, serif;
    font-size: 30px; font-weight: 800; line-height: 1.25;
    color: #1A2E35;
    margin: 22px 0 12px;
    letter-spacing: -0.5px;
  }
  .subtext {
    font-size: 15px; color: #6B7F8A;
    max-width: 520px; margin: 0 auto;
  }
  .cta-row {
    display: flex; justify-content: center; gap: 12px;
    margin-top: 28px; flex-wrap: wrap;
  }
  .cta-primary {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 13px 26px; border-radius: 14px;
    background: linear-gradient(135deg,#0D9488,#0F766E);
    color: #fff !important; font-size: 14px; font-weight: 700;
    text-decoration: none;
    border: 1px solid rgba(255,255,255,0.25);
    box-shadow: 4px 4px 12px rgba(13,148,136,0.30), inset 0 1px 0 rgba(255,255,255,0.20);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .cta-primary:hover { transform: translateY(-2px); box-shadow: 6px 6px 18px rgba(13,148,136,0.40), inset 0 1px 0 rgba(255,255,255,0.20); }
  .cta-ghost {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 13px 22px; border-radius: 14px;
    background: #F7FBF8; color: #1A2E35 !important;
    font-size: 14px; font-weight: 600; text-decoration: none;
    border: 1px solid rgba(213,232,224,0.55);
    box-shadow: 4px 4px 10px rgba(0,60,50,0.06), inset 0 1px 0 rgba(255,255,255,0.6);
    transition: transform 0.15s ease;
  }
  .cta-ghost:hover { transform: translateY(-2px); }
  .quick-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }
  .quick-card {
    padding: 18px 16px; border-radius: 16px;
    background: #FFFFFF;
    border: 1px solid rgba(213,232,224,0.5);
    box-shadow: 4px 4px 12px rgba(0,60,50,0.05), inset 0 1px 0 rgba(255,255,255,0.6);
    text-decoration: none; color: inherit;
    display: block;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .quick-card:hover {
    transform: translateY(-3px);
    box-shadow: 6px 6px 16px rgba(0,60,50,0.10), inset 0 1px 0 rgba(255,255,255,0.6);
  }
  .quick-label { font-size: 14px; font-weight: 700; color: #1A2E35; margin-bottom: 4px; }
  .quick-sub { font-size: 12px; color: #8A9BA6; }
  .quick-section-title {
    font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
    color: #8A9BA6;
    margin: 0 0 16px; padding-left: 4px;
  }
  @media (max-width: 600px) {
    .hero { padding: 36px 24px; }
    h1 { font-size: 24px; }
    main { padding: 32px 16px 60px; }
  }
</style>
</head>
<body>
<header class="header">
  <a href="/" style="display:inline-flex;align-items:center;gap:10px;text-decoration:none;">
    <span class="logo-mark">P</span>
    <span class="logo-text">PMHNP <span class="accent">Hiring</span></span>
  </a>
</header>
<main>
  <section class="clay-card hero">
    <span class="badge">${safe(opts.badge)}</span>
    <h1>${safe(opts.heading)}</h1>
    <p class="subtext">${safe(opts.subtext)}</p>
    <div class="cta-row">
      <a href="/jobs" class="cta-primary">Browse all PMHNP jobs &rarr;</a>
      <a href="/" class="cta-ghost">Back to home</a>
    </div>
  </section>

  <p class="quick-section-title">Or explore by category</p>
  <div class="quick-grid">
    <a href="/jobs/remote" class="quick-card">
      <div class="quick-label">Remote jobs</div>
      <div class="quick-sub">Work from anywhere</div>
    </a>
    <a href="/jobs/telehealth" class="quick-card">
      <div class="quick-label">Telehealth</div>
      <div class="quick-sub">Virtual psychiatric care</div>
    </a>
    <a href="/jobs/outpatient" class="quick-card">
      <div class="quick-label">Outpatient</div>
      <div class="quick-sub">Clinic-based roles</div>
    </a>
    <a href="/jobs/inpatient" class="quick-card">
      <div class="quick-label">Inpatient</div>
      <div class="quick-sub">Hospital settings</div>
    </a>
  </div>
</main>
</body>
</html>`;

    return new NextResponse(html, {
        status: 410,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Robots-Tag': 'noindex, nofollow',
            'Cache-Control': 'public, max-age=86400',
        },
    });
}

// Reusable 410 Gone response factory — kept as a thin wrapper so existing
// call sites that use a generic reason string still work without churn.
function gone410(reason: string): NextResponse {
    return styled410({
        badge: 'Page Removed',
        heading: 'This page is no longer available',
        subtext: reason,
        title: 'Page Permanently Removed — PMHNP Hiring',
    });
}

function unavailable503(): NextResponse {
    return new NextResponse(
        `<!DOCTYPE html><html><head><meta name="robots" content="noindex"><title>Service Unavailable</title></head><body><h1>503 Service Unavailable</h1><p>This URL's status could not be verified. Please retry.</p></body></html>`,
        {
            status: 503,
            headers: {
                'Content-Type': 'text/html',
                'X-Robots-Tag': 'noindex, nofollow',
                // Retry in 5 minutes — long enough for transient DB outages to
                // clear, short enough that Googlebot doesn't park the URL.
                'Retry-After': '300',
                'Cache-Control': 'no-store',
            },
        }
    );
}

// ── Verified Search & AI Crawlers ─────────────────────────────────
// Allowlist of well-known crawlers that bypass per-IP rate limits.
// We trust the UA here because:
//   1. Vercel's Verified Bots feature reverse-DNS-validates these at the edge
//      before they even reach this middleware (when enabled).
//   2. Anyone spoofing these UAs from a non-verified IP gets caught by
//      Vercel's Bot Filter (low BotScore → challenge or block).
//   3. The rate limit is a backstop, not the primary defense — it's there
//      to throttle the long tail of unidentified scrapers.
const KNOWN_CRAWLER_UAS = [
    // Search engines
    /Googlebot/i,
    /Google-InspectionTool/i,
    /AdsBot-Google/i,
    /Mediapartners-Google/i,
    /Bingbot/i,
    /BingPreview/i,
    /DuckDuckBot/i,
    /Yandex(?:Bot|Images)/i,
    /Baiduspider/i,
    /Applebot/i,
    /Sogou/i,
    /Exabot/i,
    /facebot/i,
    // AI search & LLM crawlers
    /OAI-SearchBot/i,
    /GPTBot/i,
    /ChatGPT-User/i,
    /ClaudeBot/i,
    /anthropic-ai/i,
    /PerplexityBot/i,
    /Google-Extended/i,
    /Bytespider/i,
    /CCBot/i,
    /cohere-ai/i,
    /YouBot/i,
    /Diffbot/i,
    // Social / link-preview bots (legitimate, low volume)
    /facebookexternalhit/i,
    /LinkedInBot/i,
    /Twitterbot/i,
    /Slackbot/i,
    /Discordbot/i,
    /WhatsApp/i,
    /TelegramBot/i,
    /Pinterest/i,
    /redditbot/i,
    // First-party maintenance tooling (e.g. scripts/verify-and-prepare-removal.ts).
    // Allowlisted to bypass rate limits on legitimate self-crawls; this UA
    // is set explicitly by our own scripts so spoofing it from outside gains
    // nothing but pages anyone can already see.
    /PMHNPHiringIndexer/i,
];

function isKnownCrawler(ua: string): boolean {
    if (!ua) return false;
    return KNOWN_CRAWLER_UAS.some((p) => p.test(ua));
}

// ── Strict-Consent Regions ─────────────────────────────────────────
// Countries with explicit opt-in laws (GDPR / UK GDPR / FADP / CASL+PIPEDA /
// LGPD / Privacy Act). Visitors from these regions get the consent banner
// and analytics defaults to denied. Everyone else (US, etc.) gets implied
// consent — analytics auto-granted, no banner — with footer-level opt-out.
const STRICT_CONSENT_COUNTRIES = new Set([
    // EU 27
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
    'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
    'SI', 'ES', 'SE',
    // EEA non-EU
    'NO', 'IS', 'LI',
    // UK
    'GB',
    // Switzerland (FADP)
    'CH',
    // Canada (CASL + PIPEDA)
    'CA',
    // Brazil (LGPD)
    'BR',
    // Australia (Privacy Act)
    'AU',
]);

export async function middleware(request: NextRequest) {
    const url = request.nextUrl.clone();
    const pathname = url.pathname;

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
                            return styled410({
                                badge: 'Position Removed',
                                heading: 'This position is no longer available',
                                subtext: "This job listing has been permanently removed. Don't worry — we have hundreds of similar PMHNP positions open right now.",
                                title: 'Position Removed — PMHNP Hiring',
                            });
                        }
                    } else {
                        // Supabase responded with non-2xx — log so we can detect index/quota issues.
                        console.error('[middleware:job-410] Supabase non-OK response', { status: res.status, jobId });
                    }
                }
            } catch (err) {
                // GSC Fix: always fail closed when DB check throws. Previously
                // this gated 503 on UA (crawlers only) and let real users
                // through to the page handler — that split is textbook
                // cloaking (different status code per UA on the same URL) and
                // risks a Google manual action regardless of intent. 503 +
                // Retry-After is honest for everyone; Supabase incidents are
                // rare and brief, and the alternative (serving 200 on a
                // possibly-deleted job) is a worse soft-404 trap.
                console.error('[middleware:job-410] DB check failed', {
                    jobId,
                    error: err instanceof Error ? err.message : String(err),
                });
                return unavailable503();
            }
        }
    }

    // ── 410 Gone for Empty Company Pages ──────────────────────────────
    // Companies that exist in the DB but currently have 0 active published
    // jobs were returning 404 via notFound(). Crawlers (AhrefsBot, Bingbot)
    // keep retrying these. Return 410 instead so they de-index permanently.
    // DB stores normalizedName with spaces; the slug arrives as %20-encoded
    // and Next.js path matching is case-sensitive on byte values, so we
    // decode before querying.
    if (pathname.startsWith('/companies/') && pathname.split('/').length === 3) {
        const rawSlug = pathname.split('/')[2];
        if (rawSlug && rawSlug.length > 0) {
            let decodedSlug: string;
            try {
                decodedSlug = decodeURIComponent(rawSlug);
            } catch {
                decodedSlug = rawSlug;
            }
            try {
                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.PROD_SUPABASE_URL;
                const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;
                if (supabaseUrl && supabaseKey) {
                    // Look up by normalized_name; PostgREST needs URL-encoded value.
                    const lookup = encodeURIComponent(decodedSlug);
                    const res = await fetch(
                        `${supabaseUrl}/rest/v1/companies?normalized_name=eq.${lookup}&select=id`,
                        {
                            headers: {
                                'apikey': supabaseKey,
                                'Authorization': `Bearer ${supabaseKey}`,
                            },
                        }
                    );
                    if (res.ok) {
                        const rows = await res.json();
                        if (rows.length > 0) {
                            const companyId = rows[0].id;
                            // Count active published jobs for this company.
                            const nowIso = new Date().toISOString();
                            const countRes = await fetch(
                                `${supabaseUrl}/rest/v1/jobs?company_id=eq.${companyId}&is_published=eq.true&expires_at=gt.${encodeURIComponent(nowIso)}&select=id&limit=1`,
                                {
                                    headers: {
                                        'apikey': supabaseKey,
                                        'Authorization': `Bearer ${supabaseKey}`,
                                        'Prefer': 'count=exact',
                                    },
                                }
                            );
                            if (countRes.ok) {
                                const contentRange = countRes.headers.get('content-range') || '';
                                const totalMatch = contentRange.match(/\/(\d+)$/);
                                const total = totalMatch ? parseInt(totalMatch[1], 10) : NaN;
                                if (!Number.isNaN(total) && total === 0) {
                                    return styled410({
                                        badge: 'No Open Positions',
                                        heading: 'This employer has no current openings',
                                        subtext: "This company doesn't have any active PMHNP openings right now. Browse positions from other employers below.",
                                        title: 'No Open Positions — PMHNP Hiring',
                                    });
                                }
                            }
                        } else {
                            // GSC Fix (P2.4): company slug doesn't match any Company.normalizedName
                            // at all. Pre-Mar-19, the sitemap regex-slugified Job.employer strings
                            // and submitted them as /companies/{slug}; many didn't match a real
                            // Company row → ~2,000+ zombie URLs in Google's index that 404'd.
                            // Returning 410 here de-indexes them in days vs months for 404s.
                            return gone410(`No employer page exists for "${decodedSlug}".`);
                        }
                    }
                }
            } catch (err) {
                // Same rationale as the job-410 handler above: fail closed
                // for everyone. Cloaking (UA-conditional 503) is a worse
                // SEO risk than brief unavailability during DB hiccups.
                console.error('[middleware:company-410] DB check failed', {
                    rawSlug,
                    error: err instanceof Error ? err.message : String(err),
                });
                return unavailable503();
            }
        }
    }

    // ── 410 Gone for Structurally Invalid pSEO URLs (P1.2) ────────────
    // Google's index still holds tens of thousands of legacy programmatic URLs
    // (e.g. /jobs/va/city/{nonexistent-slug}, /jobs/{old-taxonomy}/{state}) from
    // pre-quality-gate sitemap submissions. The page handlers return 404 via
    // notFound(), but 404 keeps Google re-crawling for months. 410 tells Google
    // "permanently gone, drop now" and de-indexes within days.
    //
    // We only 410 URLs that are *structurally invalid* — slugs/taxonomies that
    // can never resolve to a real page. Empty-but-structurally-valid pages
    // (e.g. /jobs/remote/florida with 0 jobs today) stay at the page-level 404
    // since they may legitimately come back when new jobs are posted.
    if (pathname.startsWith('/jobs/')) {
        const segs = pathname.split('/').filter(Boolean); // ['jobs', ...]
        // /jobs/state/{x} — state listing
        if (segs.length === 3 && segs[1] === 'state') {
            if (!resolveStateSlug(segs[2])) {
                return gone410(`No PMHNP listings exist for the state "${segs[2]}".`);
            }
        }
        // /jobs/metro/{x} — metro landing page
        else if (segs.length === 3 && segs[1] === 'metro') {
            if (!METRO_SLUG_SET.has(segs[2])) {
                return gone410(`No metro landing page exists for "${segs[2]}".`);
            }
        }
        // /jobs/{cat}/{x} — category × state (only some taxonomies have state pages)
        else if (segs.length === 3 && segs[1] !== 'city' && segs[1] !== 'metro') {
            const cat = segs[1];
            const tail = segs[2];
            // Skip job-detail pages (slug ends in UUID) — handled by job-detail 410 block above
            const isJobDetail = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(tail);
            if (!isJobDetail) {
                if (STATE_ELIGIBLE_TAXONOMIES.has(cat)) {
                    // Valid state-eligible taxonomy — tail must be a real state slug.
                    if (!resolveStateSlug(tail)) {
                        return gone410(`No PMHNP listings exist for "${cat}" in "${tail}".`);
                    }
                } else if (CITY_ELIGIBLE_TAXONOMIES.has(cat)) {
                    // City-only taxonomy used in state-shaped URL — invalid shape.
                    return gone410(`The URL pattern /jobs/${cat}/${tail} is not a valid listing (use /jobs/${cat}/city/{slug}).`);
                } else {
                    // Unknown taxonomy entirely — never a valid page.
                    return gone410(`The category "${cat}" is not a recognized PMHNP listing.`);
                }
            }
        }
        // /jobs/{cat}/city/{slug} — category × city
        else if (segs.length === 4 && segs[2] === 'city') {
            const cat = segs[1];
            const slug = segs[3];
            if (!CITY_ELIGIBLE_TAXONOMIES.has(cat)) {
                return gone410(`The category "${cat}" is not a recognized PMHNP city listing.`);
            }
            if (!isKnownCitySlug(slug)) {
                return gone410(`No PMHNP city page exists for "${slug}".`);
            }
        }
        // /jobs/city/{slug} — generic city listing
        // Skip strict validation: page handler does ambiguous-slug DB resolution
        // (e.g., "virginia-beach" without state code → resolves to "virginia-beach-va").
        // 404 stays at page level for now; legacy 404s will be drained via P2 cron.
    }

    // ── CSP Nonce Generation ──────────────────────────────────────────
    // Generate a unique nonce per request for Content-Security-Policy
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

    const isLocalhost = request.headers.get('host')?.includes('localhost');

    // Build CSP with nonce.
    //
    // Scripts: nonce + explicit hosts. We do NOT use 'strict-dynamic' —
    // we still want the host whitelist to block third-party scripts a
    // successful XSS might try to inject.
    //
    // Styles: 'unsafe-inline' is kept because Next.js (App Router +
    // Turbopack) injects runtime style elements that cannot be nonced.
    // Removing it breaks the app. Documented as residual gap.
    //
    // script-src-elem / style-src-elem / style-src-attr are explicit
    // because some browsers (Safari) treat the unprefixed directive
    // differently for inline vs external resources.
    const cspDirectives = [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' https://www.googletagmanager.com https://www.google-analytics.com https://js.stripe.com`,
        `script-src-elem 'self' 'nonce-${nonce}' https://www.googletagmanager.com https://www.google-analytics.com https://js.stripe.com`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "style-src-attr 'unsafe-inline'",
        "img-src 'self' data: blob: https://*.supabase.co https://lh3.googleusercontent.com https://www.google-analytics.com https://www.googletagmanager.com",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self' https://*.supabase.co https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://api.resend.com https://*.upstash.io https://api.stripe.com",
        "frame-src 'self' https://js.stripe.com https://www.youtube.com",
        "media-src 'self' https://*.supabase.co",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
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
    // DB stores Company.normalizedName with spaces. Both spaced and %20-encoded
    // URLs already resolve correctly via Next.js param decoding, so we leave
    // those alone. We only normalize uppercase here (handled by case-fold below).

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

    // ── Per-IP Rate Limiting on Public Listing Paths ─────────────────
    // Anti-scraping defense for our highest-value public pages. Verified
    // crawlers (Googlebot, GPTBot, etc.) bypass the limit. Real users
    // browse 5–30 pages/min — well under the thresholds. Anything
    // hitting these limits is mass-scraping our job catalog.
    //
    // Edge cases:
    //   - GET only (POSTs go through their own API rate limits)
    //   - Skipped on _next/data/ JSON fetches (handled by Next.js itself)
    const userAgent = request.headers.get('user-agent') || '';
    const isCrawler = isKnownCrawler(userAgent);
    if (
        request.method === 'GET' &&
        !isCrawler &&
        !pathname.startsWith('/_next/')
    ) {
        let limitConfig: { limit: number; windowSeconds: number } | null = null;
        let limitKey = '';

        if (pathname.startsWith('/jobs/') && pathname.split('/').length === 3) {
            // Job detail: /jobs/[slug]
            limitConfig = RATE_LIMITS.publicDetail;
            limitKey = 'public:job-detail';
        } else if (pathname === '/jobs' || pathname.startsWith('/jobs/')) {
            // Job listings + faceted listings (/jobs/remote, /jobs/full-time, etc.)
            limitConfig = RATE_LIMITS.publicListing;
            limitKey = 'public:job-listing';
        } else if (pathname.startsWith('/companies/')) {
            limitConfig = RATE_LIMITS.publicCompany;
            limitKey = 'public:company';
        }

        if (limitConfig) {
            const limited = await rateLimit(request, limitKey, limitConfig);
            if (limited) return limited;
        }
    }

    // Refresh the Supabase session (keeps auth cookies alive)
    const response = await updateSession(request);

    // Set CSP header and pass nonce to layout via request header.
    // Skip CSP injection for the admin email-preview route — it self-manages a
    // looser policy so its inline polling script can resize iframes.
    const skipCsp = request.nextUrl.pathname.startsWith('/api/email-preview');
    if (!skipCsp) {
      response.headers.set('Content-Security-Policy', cspHeader);
    }
    response.headers.set('x-nonce', nonce);

    // ── GPC / DNT Privacy Signals ────────────────────────────────────
    // CCPA/CPRA legally requires honoring Global Privacy Control.
    // We honor DNT as best practice. Both signals = auto-opt-out of
    // analytics/advertising consent. We expose the signal as a non-
    // HttpOnly cookie so client components can auto-deny without a
    // round-trip, and as a request header for SSR awareness.
    const gpc = request.headers.get('sec-gpc') === '1';
    const dnt = request.headers.get('dnt') === '1';
    if (gpc || dnt) {
        const signal = gpc ? 'gpc' : 'dnt';
        response.headers.set('x-privacy-signal', signal);
        // Refreshed each request so disabling the browser flag clears it
        // on the next navigation. Not HttpOnly — the consent banner needs
        // to read it client-side. Not Secure-only because dev runs http.
        response.cookies.set('pmhnp_privacy_signal', signal, {
            path: '/',
            sameSite: 'lax',
            secure: !isLocalhost,
            maxAge: 60 * 60 * 24 * 30, // 30 days
        });
    } else {
        // Clear stale cookie if user disabled the browser signal
        if (request.cookies.get('pmhnp_privacy_signal')) {
            response.cookies.delete('pmhnp_privacy_signal');
        }
    }

    // ── Consent Region (geo-targeted defaults) ───────────────────────
    // Vercel injects x-vercel-ip-country on every request in production.
    // Strict regions get opt-in (banner + denied defaults). Everyone else
    // gets implied consent (no banner, analytics auto-granted, ads denied).
    // Default to 'strict' when the country is unknown (dev / proxy / VPN
    // edge cases) so we fail safe toward stronger consent.
    const country = (
        request.headers.get('x-vercel-ip-country') ||
        request.headers.get('cf-ipcountry') ||
        ''
    ).toUpperCase();
    const region = country && !STRICT_CONSENT_COUNTRIES.has(country)
        ? 'implied'
        : 'strict';
    response.headers.set('x-consent-region', region);
    response.cookies.set('pmhnp_consent_region', region, {
        path: '/',
        sameSite: 'lax',
        secure: !isLocalhost,
        maxAge: 60 * 60 * 24, // 1 day — re-evaluated on every visit
    });

    // ── CORS Headers for API Routes ──────────────────────────────────
    // Restrict cross-origin API access to only our own domain.
    // Without this, any website can fetch our API and scrape data.
    //
    // SEO Fix M7: added `Vary: Origin` header (defense-in-depth).
    // Without it, a shared cache (Vercel edge / CDN) could serve a
    // response generated for origin A back to origin B because the cache
    // key didn't include the Origin header. With it, caches keep separate
    // entries per origin. The origin allowlist below is the actual
    // security boundary; Vary just hardens the cache layer.
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
        // Append (not set) to preserve any existing Vary value from the
        // upstream response.
        const existingVary = response.headers.get('Vary');
        response.headers.set(
            'Vary',
            existingVary && !existingVary.toLowerCase().includes('origin')
                ? `${existingVary}, Origin`
                : existingVary ?? 'Origin',
        );
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
    // SEO Fix: include the BARE prefix as well as `prefix/`. Previously
    // `pathname.startsWith('/dashboard/')` failed to match `/dashboard` exactly,
    // so app/dashboard/page.tsx (and app/admin/page.tsx) returned 200 with no
    // X-Robots-Tag — leaking user-private surfaces into Google's index.
    const hasNoindexPrefix = (prefix: string) =>
        pathname === prefix || pathname.startsWith(prefix + '/');
    const isNoindexPath = noindexPaths.some(p => pathname === p || pathname.startsWith(p + '/'))
        || hasNoindexPrefix('/employer')
        || hasNoindexPrefix('/admin')
        || hasNoindexPrefix('/dashboard')
        || hasNoindexPrefix('/auth')
        || pathname.startsWith('/jobs/edit/')
        || (pathname.startsWith('/api/') && !pathname.startsWith('/api/og') && !pathname.startsWith('/api/sitemaps'));
    if (isNoindexPath) {
        response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    }

    // GSC Fix (P3.5): noindex any paginated view (?page=2 or higher).
    // Many category landing pages were missing the page > 1 noindex in their
    // generateMetadata() — instead of editing 14 separate files, set the
    // header globally here. The earlier middleware block already 301-redirects
    // ?page=1 to the bare URL, so this only fires for legitimate page > 1.
    // Use 'noindex, follow' (NOT nofollow) so PageRank flows through to the
    // jobs/companies linked from the paginated view.
    const pageParam = request.nextUrl.searchParams.get('page');
    if (pageParam && pageParam !== '1') {
        const pageNum = parseInt(pageParam, 10);
        if (Number.isFinite(pageNum) && pageNum >= 2) {
            response.headers.set('X-Robots-Tag', 'noindex, follow');
        }
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

