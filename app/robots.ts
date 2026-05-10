import { MetadataRoute } from 'next'

// ── P2.3: Auth-pages temporary unblock window ────────────────────────
// We unblocked /signup, /login, /messages, /saved, /job-alerts/manage,
// /employer/login from FULL_DISALLOW so Googlebot can crawl them, see the
// X-Robots-Tag: noindex header, and drop them from the index. After the
// window below expires we MUST re-add them to FULL_DISALLOW. The CI test
// at tests/sitemap-budget.test.ts (P4) should fail if today > this date.
const AUTH_REBLOCK_DATE = '2026-05-19'; // 14 days from 2026-05-04

// ── Allow lists ──────────────────────────────────────────────────────
// Public surfaces every legitimate crawler should be able to index.
const PUBLIC_ALLOW = [
  '/',
  '/jobs/',
  '/blog/',
  '/companies/',
  '/salary-guide',
  '/salary-guide/',
  '/for-job-seekers',
  '/for-employers',
  '/faq',
  '/post-job',
  // Static content / hub pages that appear in the sitemap. Previously
  // these were implicitly crawlable (no FULL_DISALLOW prefix matched them)
  // but explicit allows protect against future disallow patterns
  // accidentally creating a prefix match. Mirrors the sitemap entry list.
  '/about',
  '/contact',
  '/pricing',
  '/resources',
  '/resources/',
  '/job-alerts',
  // Explicitly allow sitemap API and OG image API
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
  // Auth & user-private surfaces (not the leaked-into-index ones — those
  // are temporarily unblocked above per P2.3)
  '/employer/dashboard/',
  '/employer/candidates/',
  '/employer/settings',
  '/employer/signup',
  '/admin/',
  '/dashboard/',
  '/auth/',
  '/settings',
  '/my-applications',
  '/unauthorized',
  '/success',
  // Raw media assets (sitemap exposes the indexable ones)
  '/videos/',
]

// Lighter disallow for social/link-preview bots — they only fetch the
// exact URL shared, so they need access to almost everything that isn't
// pure infrastructure. Auth-gated surfaces extended (audit 01 M-2):
// when a user shares a link to a protected page the bot fetches it,
// receives a login shell, and generates a broken preview card — better
// to refuse the fetch outright.
const SOCIAL_DISALLOW = [
  '/api/',
  '/admin/',
  '/dashboard/',
  '/auth/',
  '/employer/dashboard/',
  '/employer/candidates/',
  '/employer/settings',
  '/settings',
  '/my-applications',
  '/saved',
  '/messages',
]

// ── Crawler rosters ──────────────────────────────────────────────────
// AI / LLM / search-AI crawlers all get the FULL disallow list.
const AI_CRAWLERS = [
  'OAI-SearchBot',     // OpenAI search index
  'GPTBot',            // OpenAI training
  'ChatGPT-User',      // ChatGPT live browsing
  'PerplexityBot',     // Perplexity index
  'ClaudeBot',         // Anthropic crawler (current)
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

// SEO link-graph crawlers. Allowed to crawl the public site, but throttled
// because they generate volume (Ahrefs alone hit ~1,700 pages in a 2.5h
// window — most of them 410'd job pages) without driving traffic in return.
// Crawl-delay is honored by AhrefsBot, MJ12bot, SemrushBot, DotBot, and
// PetalBot. (Googlebot and Bingbot do NOT honor crawl-delay — use their
// respective Search Console crawl rate settings instead.)
const SEO_CRAWLERS = [
  'AhrefsBot',
  'SemrushBot',
  'MJ12bot',
  'DotBot',
  'PetalBot',
  'YandexBot',
] as const

// Throttle high-volume LLM crawlers without blocking them entirely. Most of
// these honor Crawl-delay; for those that don't (PerplexityBot historically),
// the directive is at least documented intent and a hint to behave.
const AI_CRAWL_DELAY_SECONDS = 5

// SEO-tool crawlers — heavier throttle since their access doesn't directly
// drive user value.
const SEO_CRAWL_DELAY_SECONDS = 10

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com'

  // P2.3: nag the logs if we're past the auth-pages re-block deadline.
  // The intent is for a human to verify de-indexing in GSC and then
  // re-add /signup, /login, /messages, /saved, /job-alerts/manage,
  // /employer/login to FULL_DISALLOW. This warning makes "we forgot"
  // visible in Vercel logs once a day (sitemap revalidates).
  if (new Date().toISOString().slice(0, 10) > AUTH_REBLOCK_DATE) {
    console.warn(`[robots.ts] AUTH_REBLOCK_DATE (${AUTH_REBLOCK_DATE}) has passed. Verify GSC "Indexed, though blocked by robots.txt" is at 0, then re-add auth paths to FULL_DISALLOW.`);
  }

  return {
    rules: [
      // Catch-all rule (Google, Bing, anyone unlisted)
      {
        userAgent: '*',
        allow: PUBLIC_ALLOW,
        disallow: FULL_DISALLOW,
      },
      // AI search & LLM crawlers — same access, but with a crawl delay so
      // they don't dominate traffic share (PerplexityBot was 22% of all hits).
      ...AI_CRAWLERS.map((ua) => ({
        userAgent: ua,
        allow: PUBLIC_ALLOW,
        disallow: FULL_DISALLOW,
        crawlDelay: AI_CRAWL_DELAY_SECONDS,
      })),
      // SEO link-graph crawlers — throttled. They retain access to the
      // public site so backlink data still updates.
      ...SEO_CRAWLERS.map((ua) => ({
        userAgent: ua,
        allow: PUBLIC_ALLOW,
        disallow: FULL_DISALLOW,
        crawlDelay: SEO_CRAWL_DELAY_SECONDS,
      })),
      // Social / link-preview bots — they fetch single URLs on demand
      ...SOCIAL_BOTS.map((ua) => ({
        userAgent: ua,
        allow: '/',
        disallow: SOCIAL_DISALLOW,
      })),
    ],
    sitemap: [
      `${baseUrl}/api/sitemaps/index`,
      `${baseUrl}/sitemap.xml`,
      `${baseUrl}/image-sitemap.xml`,
      `${baseUrl}/video-sitemap.xml`,
    ],
  }
}
