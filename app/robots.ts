import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com'

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/_next/',
          '/_next/static/',
          '/jobs/edit/',
          '/employer/',
          '/email-preferences',
          '/success',
          '/post-job/checkout',
          '/post-job/preview',
          '/job-alerts/manage',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}

