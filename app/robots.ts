import { MetadataRoute } from 'next'

// Opt out of build-time prerender so robots.txt regenerates on every request.
// Diagnosed 2026-05-10 (issue #162): the d916ec2 Crawl-delay directives were
// silently absent from the live /robots.txt while the same code emitted them
// locally. Root cause: Next.js 16 was serving a build-time-frozen prerender
// artifact even after redeploys, because the build hash never invalidated.
// vercel.json already pins /robots.txt to s-maxage=86400, so the CDN still
// serves cached responses — this just guarantees the function runs on cache
// fills against the latest source.
export const dynamic = 'force-dynamic'

// ── P2.3: Auth-pages temporary unblock window ────────────────────────
// We unblocked /signup, /login, /messages, /saved, /job-alerts/manage,
// /employer/login from FULL_DISALLOW so Googlebot can crawl them, see the
// X-Robots-Tag: noindex header, and drop them from the index. After the
// window below expires we MUST re-add them to FULL_DISALLOW. The CI test
// at tests/sitemap-budget.test.ts (P4) should fail if today > this date.
const AUTH_REBLOCK_DATE = '2026-05-19'; // 14 days from 2026-05-04

// S3 fix (2026-06-01): the auth pages that were temporarily unblocked
// during the GSC de-index window now need to be silently re-added to the
// disallow list once we're past AUTH_REBLOCK_DATE. The previous version
// only printed `console.warn` (line 211 below) and never actually
// re-blocked, so /signup, /login, /messages, /saved, /job-alerts/manage,
// /employer/login stayed crawlable indefinitely.
const POST_DEADLINE_AUTH_REBLOCK = [
  '/signup',
  '/login',
  '/messages',
  '/saved',
  '/job-alerts/manage',
  '/employer/login',
];

// ── Allow lists ──────────────────────────────────────────────────────
// Public surfaces every legitimate crawler should be able to index.
// Carve-outs from FULL_DISALLOW. RFC 9309 + Google's parser apply
// "longest match wins, Allow wins ties," so listing these explicitly lets
// crawlers reach /api/sitemaps/* and /api/og/* even though /api/ is
// disallowed below. All other public surfaces (/, /jobs, /blog, /companies,
// /salary-guide, /about, /contact, /pricing, /faq, /post-job, /resources,
// /job-alerts, /for-job-seekers, /for-employers) are implicitly allowed
// because no Disallow rule matches them — no need to enumerate.
const PUBLIC_ALLOW = [
  // No trailing slash on /api/sitemaps so the rule matches both
  // /api/sitemaps/index and /api/sitemaps/cities/N — the previous trailing
  // slash form excluded the bare /api/sitemaps with some strict parsers.
  '/api/sitemaps',
  '/api/og',
]

// ── Disallow lists ───────────────────────────────────────────────────
// Full disallow list — applied to `*` AND every named AI/search crawler.
// Token-based URLs (edit, checkout, manage, unsubscribe, password reset)
// must never be crawled or trained on. Internal Next.js data routes too.
//
// GSC Fix (P2.3): /signup, /login, /messages, /saved, /job-alerts/manage,
// /employer/login were previously hard-blocked here, which prevented Googlebot
// from ever fetching them. Result: 5 URLs stuck in GSC's "Indexed, though
// blocked by robots.txt" category — Google indexed them from sitemaps/links
// before the block, then couldn't crawl to see our X-Robots-Tag: noindex.
//
// Fix sequence (must run together):
//   1. (this PR) Move auth pages OUT of FULL_DISALLOW so Googlebot can crawl.
//   2. Middleware sets X-Robots-Tag: noindex, nofollow on these paths
//      (already in middleware.ts:461-477 — verified before deploy).
//   3. Run scripts/deindex-auth-pages.ts once to submit URL_DELETED via
//      Indexing API (instant signal vs waiting for crawl).
//   4. Wait 14 days for Google to confirm de-indexed.
//   5. RE-ADD these paths to FULL_DISALLOW. Tracked by AUTH_REBLOCK_DATE
//      below — CI lint should fail if today >= AUTH_REBLOCK_DATE and these
//      paths aren't back in FULL_DISALLOW.
const FULL_DISALLOW = [
  // Block all other API routes. The /api/sitemaps/ and /api/og allows in
  // PUBLIC_ALLOW above carve out the public sub-routes; everything else
  // under /api/ is blocked here. The previous list emitted dead lines for
  // /api/cron/, /api/webhooks/, /api/admin/ — they were already covered
  // by /api/ across all 21 named-crawler rule blocks, just adding noise.
  '/api/',
  // Internal Next.js client-side navigation data (allow /_next/static/ for JS/CSS)
  '/_next/data/',
  // Token-bearing URLs — must not be indexed (these are SAFE to keep blocked
  // because they require tokens that Google has never seen)
  '/jobs/edit/',
  '/post-job/checkout',
  '/post-job/preview',
  '/job-alerts/unsubscribe',
  '/email-preferences',
  '/unsubscribe',
  '/reset-password',
  '/forgot-password',
  // Auth & user-private surfaces. Path prefixes WITHOUT trailing slashes
  // so they match both the bare URL (e.g. /dashboard, served by
  // app/dashboard/page.tsx) AND child paths (/dashboard/foo). Robots.txt
  // does prefix matching: `/dashboard/` only matches /dashboard/* — not
  // the bare /dashboard. Most of these have a real page at the bare URL
  // so dropping the trailing slash plugs a coverage gap. (Not the
  // leaked-into-index auth pages — those are temporarily unblocked per
  // P2.3.)
  '/employer/dashboard',
  '/employer/candidates',
  '/employer/applicants',
  '/employer/talent-search',
  '/employer/renewal-success',
  '/employer/settings',
  '/employer/signup',
  '/admin',
  '/dashboard',
  '/auth',
  '/onboarding',
  '/settings',
  '/my-applications',
  '/unauthorized',
  '/success',
  // Raw media assets (sitemap exposes the indexable ones)
  '/videos/',
  // GSC Fix (2026-07 audit P1.2): parameterized filter/prefill URLs were
  // the dominant share of noindexed-page crawl volume (thousands of URLs in the
  // noindex drilldown). They exist only as filter/prefill conveniences,
  // are permanently noindexed anyway, and every job they could surface is
  // already in the job sitemaps — crawling them is pure budget waste.
  // /jobs?page= stays crawlable DELIBERATELY: deep unfiltered pagination
  // is a documented job-detail discovery channel (app/jobs/page.tsx).
  // '?' is a literal in robots matching; '*' wildcards are honored by
  // Google and Bing.
  '/job-alerts?',
  '/jobs?*employer=',
  '/jobs?*location=',
  '/jobs?*q=',
  '/jobs?*jobType=',
  '/jobs?*category=',
]

// Lighter disallow for social/link-preview bots — they only fetch the
// exact URL shared, so they need access to almost everything that isn't
// pure infrastructure. Auth-gated surfaces extended (audit 01 M-2):
// when a user shares a link to a protected page the bot fetches it,
// receives a login shell, and generates a broken preview card — better
// to refuse the fetch outright. Path prefixes match the FULL_DISALLOW
// convention (no trailing slash → covers bare + child paths).
//
// Note on /login, /signup, /employer/login, /job-alerts/manage:
//   These are P2.3 carve-outs in FULL_DISALLOW (intentionally crawlable
//   so Googlebot can read the X-Robots-Tag: noindex header and drop
//   them from the index). Social bots don't honor X-Robots-Tag — they
//   just render whatever HTML they fetch, which for these paths is a
//   login shell. Blocking them HERE (but not for Googlebot) keeps
//   preview cards useful without re-trapping Googlebot in the original
//   "Indexed though blocked by robots.txt" state.
const SOCIAL_DISALLOW = [
  '/api/',
  '/admin',
  '/dashboard',
  '/auth',
  '/onboarding',
  '/employer/dashboard',
  '/employer/candidates',
  '/employer/applicants',
  '/employer/talent-search',
  '/employer/settings',
  '/employer/login',
  '/settings',
  '/my-applications',
  '/saved',
  '/messages',
  '/login',
  '/signup',
  '/job-alerts/manage',
]

// ── Crawler rosters ──────────────────────────────────────────────────
// AI / LLM / search-AI crawlers all get the FULL disallow list.
const AI_CRAWLERS = [
  'OAI-SearchBot',     // OpenAI search index
  'GPTBot',            // OpenAI training
  'ChatGPT-User',      // ChatGPT live browsing
  'PerplexityBot',     // Perplexity index
  // ClaudeBot moved to a dedicated rule block below with explicit Allow: /
  // — Anthropic's fetcher was reading this group's bulk Disallow list and
  // treating the entire site as off-limits (no explicit Allow: / line to
  // disambiguate). 'anthropic-ai' (legacy UA) and 'Claude-Web' stay here.
  'anthropic-ai',      // Anthropic crawler (legacy UA)
  'Claude-Web',        // Claude.ai web fetcher
  'Google-Extended',   // Google AI/Gemini training
  'Bytespider',        // ByteDance / TikTok AI
  'CCBot',             // Common Crawl
  'cohere-ai',         // Cohere crawler
  'Diffbot',           // Diffbot AI
  'YouBot',            // You.com
  'Amazonbot',         // Amazon AI
  'meta-externalagent', // Meta AI
  'Applebot-Extended', // Apple Intelligence training
  // Newer 2025-2026 crawlers picked up since the original list was set —
  // each was active in production logs but had no entry, falling through
  // to the catch-all '*' rule (no crawl-delay, no per-bot throttle).
  'MistralAI-User',    // Mistral AI live browsing
  'AI2Bot',            // Allen Institute for AI
  'iaskspider',        // iAsk.AI
  'Kangaroo',          // Jina AI Reader
  'Timpibot',          // Timpi search index
  'img2dataset',       // Hugging Face dataset crawler
] as const

const SOCIAL_BOTS = [
  'Twitterbot',
  'facebookexternalhit',
  'LinkedInBot',
  'Pinterest',
  'Slackbot',
  'WhatsApp',
  'Discordbot',
  'TelegramBot',
  'redditbot',
] as const

// SEO link-graph crawlers. Allowed to crawl the public site so backlink
// data / domain authority reports stay current. The previous Crawl-Delay
// throttle (10s, ~360 pages/hr) was removed 2026-05-11 in favor of
// max-SEO posture — Vercel bandwidth headroom is fine and these crawlers
// indirectly feed third-party SEO tools the user base uses to evaluate
// the site.
const SEO_CRAWLERS = [
  'AhrefsBot',
  'SemrushBot',
  'MJ12bot',
  'DotBot',
  'PetalBot',
  'YandexBot',
] as const

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com'

  // S3 fix (2026-06-01): now that the date has passed, actually enforce
  // the reblock — append the auth paths to the per-rule disallow lists
  // below — rather than just logging a reminder. The previous version
  // only printed a warning and left the paths crawlable, defeating the
  // purpose of the deadline.
  const todayIso = new Date().toISOString().slice(0, 10);
  const pastDeadline = todayIso > AUTH_REBLOCK_DATE;
  const effectiveFullDisallow = pastDeadline
    ? [...FULL_DISALLOW, ...POST_DEADLINE_AUTH_REBLOCK]
    : FULL_DISALLOW;
  if (pastDeadline) {
    console.info(`[robots.ts] AUTH_REBLOCK_DATE (${AUTH_REBLOCK_DATE}) passed — re-applying auth-page disallow.`);
  }

  return {
    rules: [
      // ── ClaudeBot — dedicated rule with EXPLICIT `Allow: /` ─────────
      // 2026-05-11: Anthropic's fetcher was reading the AI-bot group's
      // bulk Disallow list and treating the entire site as disallowed,
      // because there was no explicit `Allow: /` to disambiguate.
      // RFC 9309 specifies longest-match-wins, but real-world parsers
      // (including Anthropic's) often fall back to conservative
      // interpretation when no positive Allow rule is present.
      //
      // Fix: dedicate a rule block to ClaudeBot with an explicit Allow,
      // followed by a tight disallow list covering only the auth-private
      // surfaces. Placed FIRST in the rules array so any parser scanning
      // top-down sees it before the catch-all `*`.
      {
        userAgent: 'ClaudeBot',
        allow: '/',
        disallow: [
          '/api/',
          '/admin',
          '/dashboard',
          '/auth',
          '/onboarding',
          '/employer/dashboard',
          '/employer/candidates',
          '/employer/applicants',
          '/employer/talent-search',
          '/employer/settings',
          '/settings',
          '/my-applications',
        ],
      },
      // Catch-all rule (Googlebot, Bingbot, anyone unlisted). Implicit
      // "Allow: /" semantics — everything not matched by a Disallow is
      // crawlable. Carve-outs (/api/sitemaps, /api/og) win over the
      // /api/ Disallow because they're more specific paths.
      {
        userAgent: '*',
        allow: PUBLIC_ALLOW,
        disallow: effectiveFullDisallow,
      },
      // AI search & LLM crawlers grouped into one block. Named explicitly
      // (rather than letting them fall through to the catch-all) so the
      // signal "we welcome these crawlers" is unmistakable to AI tools
      // that scan robots.txt for per-bot rules. Same disallow list as
      // the catch-all — no throttle, full public coverage.
      {
        userAgent: [...AI_CRAWLERS],
        allow: PUBLIC_ALLOW,
        disallow: effectiveFullDisallow,
      },
      // SEO link-graph crawlers grouped. Same posture: explicit allow
      // for max backlink-graph coverage so Ahrefs/Semrush/etc. can keep
      // domain authority data current. Crawl-Delay throttle removed
      // 2026-05-11 — max SEO across all bots.
      {
        userAgent: [...SEO_CRAWLERS],
        allow: PUBLIC_ALLOW,
        disallow: effectiveFullDisallow,
      },
      // Social / link-preview bots grouped — fetch a single URL on
      // demand for the preview card, so they need access to almost
      // everything public; the lighter SOCIAL_DISALLOW just keeps
      // them out of auth-gated surfaces where the preview would be
      // a login shell anyway.
      {
        userAgent: [...SOCIAL_BOTS],
        allow: '/',
        disallow: SOCIAL_DISALLOW,
      },
    ],
    sitemap: [
      `${baseUrl}/api/sitemaps/index`,
      `${baseUrl}/sitemap.xml`,
      `${baseUrl}/image-sitemap.xml`,
      `${baseUrl}/video-sitemap.xml`,
    ],
  }
}
