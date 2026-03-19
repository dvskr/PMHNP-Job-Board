import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com'

  return {
    rules: [
      // Main crawlers
      {
        userAgent: '*',
        allow: [
          '/',
          '/jobs/',
          '/blog/',
          '/salary-guide',
          '/for-job-seekers',
          '/for-employers',
          '/faq',
          '/post-job',
          // Explicitly allow sitemap API and OG image API
          '/api/sitemaps/',
          '/api/og',
        ],
        disallow: [
          // Block all other API routes (must come after allows — Google uses
          // longest-match rule, so /api/sitemaps/ will still be allowed)
          '/api/',
          '/_next/',
          '/jobs/edit/',
          '/employer/',
          '/email-preferences',
          '/success',
          '/post-job/checkout',
          '/post-job/preview',
          '/job-alerts/manage',
          '/job-alerts/unsubscribe',
          '/admin/',
          '/dashboard/',
          '/saved',
          '/settings',
          '/reset-password',
          '/unauthorized',
          '/login',
          '/signup',
          '/forgot-password',
          '/unsubscribe',
          '/auth/',
          '/messages',
          '/my-applications',
        ],
      },
      // AI search crawlers — same blocks for API/admin/dashboard/auth
      {
        userAgent: 'OAI-SearchBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/', '/auth/', '/login', '/signup', '/settings', '/saved', '/employer/', '/messages'],
      },
      {
        userAgent: 'GPTBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/', '/auth/', '/login', '/signup', '/settings', '/saved', '/employer/', '/messages'],
      },
      {
        userAgent: 'PerplexityBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/', '/auth/', '/login', '/signup', '/settings', '/saved', '/employer/', '/messages'],
      },
      {
        userAgent: 'ClaudeBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/', '/auth/', '/login', '/signup', '/settings', '/saved', '/employer/', '/messages'],
      },
      {
        userAgent: 'Google-Extended',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/', '/auth/', '/login', '/signup', '/settings', '/saved', '/employer/', '/messages'],
      },
      // Social media bots for link previews
      {
        userAgent: 'Twitterbot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/'],
      },
      {
        userAgent: 'facebookexternalhit',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/'],
      },
      {
        userAgent: 'LinkedInBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/'],
      },
      {
        userAgent: 'Pinterest',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/'],
      },
      {
        userAgent: 'Slackbot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/'],
      },
      {
        userAgent: 'WhatsApp',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/'],
      },
      {
        userAgent: 'Discordbot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/'],
      },
      {
        userAgent: 'TelegramBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/'],
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
