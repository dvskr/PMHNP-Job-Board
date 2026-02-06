import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com'

  return {
    rules: [
      // Main crawlers
      {
        userAgent: '*',
        allow: ['/', '/api/og'],
        disallow: [
          '/api/',
          '/_next/',
          '/jobs/edit/',
          '/employer/dashboard/',
          '/email-preferences',
          '/success',
          '/post-job/checkout',
          '/post-job/preview',
          '/job-alerts/manage',
          '/admin/',
          '/dashboard/',
        ],
      },
      // Explicitly allow AI search crawlers
      {
        userAgent: 'OAI-SearchBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/'],
      },
      {
        userAgent: 'GPTBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/'],
      },
      {
        userAgent: 'PerplexityBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/'],
      },
      {
        userAgent: 'ClaudeBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/'],
      },
      {
        userAgent: 'Google-Extended',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}

