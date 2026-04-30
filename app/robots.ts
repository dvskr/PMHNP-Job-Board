import { MetadataRoute } from 'next'

// ── Allow lists ──────────────────────────────────────────────────────
// Public surfaces every legitimate crawler should be able to index.
const PUBLIC_ALLOW = [
  '/',
  '/jobs/',
  '/blog/',
  '/companies/',
  '/salary-guide',
  '/for-job-seekers',
  '/for-employers',
  '/faq',
  '/post-job',
  // Explicitly allow sitemap API and OG image API
  '/api/sitemaps/',
  '/api/og',
]

// ── Disallow lists ───────────────────────────────────────────────────
// Full disallow list — applied to `*` AND every named AI/search crawler.
// Token-based URLs (edit, checkout, manage, unsubscribe, password reset)
// must never be crawled or trained on. Internal Next.js data routes too.
const FULL_DISALLOW = [
  // Block all other API routes (longest-match rule keeps /api/sitemaps/ allowed)
  '/api/',
  '/api/cron/',
  '/api/webhooks/',
  '/api/admin/',
  // Internal Next.js client-side navigation data (allow /_next/static/ for JS/CSS)
  '/_next/data/',
  // Token-bearing URLs — must not be indexed
  '/jobs/edit/',
  '/post-job/checkout',
  '/post-job/preview',
  '/job-alerts/manage',
  '/job-alerts/unsubscribe',
  '/email-preferences',
  '/unsubscribe',
  '/reset-password',
  '/forgot-password',
  // Auth & user-private surfaces
  '/employer/',
  '/admin/',
  '/dashboard/',
  '/auth/',
  '/login',
  '/signup',
  '/settings',
  '/saved',
  '/messages',
  '/my-applications',
  '/unauthorized',
  '/success',
  // Raw media assets (sitemap exposes the indexable ones)
  '/videos/',
]

// Lighter disallow for social/link-preview bots — they only fetch the
// exact URL shared, so they need access to almost everything that isn't
// pure infrastructure.
const SOCIAL_DISALLOW = ['/api/', '/admin/', '/dashboard/']

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

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com'

  return {
    rules: [
      // Catch-all rule (Google, Bing, anyone unlisted)
      {
        userAgent: '*',
        allow: PUBLIC_ALLOW,
        disallow: FULL_DISALLOW,
      },
      // AI search & LLM crawlers — same protections as catch-all
      ...AI_CRAWLERS.map((ua) => ({
        userAgent: ua,
        allow: PUBLIC_ALLOW,
        disallow: FULL_DISALLOW,
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
