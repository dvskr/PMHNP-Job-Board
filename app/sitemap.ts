import { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { getPostSlugs } from '@/lib/blog'

// Type for job query result
interface JobSitemapData {
  id: string;
  title: string;
  updatedAt: Date;
}

// All 50 US states + DC
const US_STATES = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
  'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
  'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana',
  'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
  'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
  'new-hampshire', 'new-jersey', 'new-mexico', 'new-york',
  'north-carolina', 'north-dakota', 'ohio', 'oklahoma', 'oregon',
  'pennsylvania', 'rhode-island', 'south-carolina', 'south-dakota',
  'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington',
  'west-virginia', 'wisconsin', 'wyoming', 'district-of-columbia'
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com'

  // Static pages
  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1.0,
    },
    {
      url: `${baseUrl}/jobs`,
      lastModified: new Date(),
      changeFrequency: 'hourly' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/post-job`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/for-employers`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/for-job-seekers`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
    {
      url: `${baseUrl}/faq`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    },
    {
      url: `${baseUrl}/job-alerts`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/signup`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    },
  ]

  // SEO Landing Pages

  // Remote jobs page
  const remoteJobsPage = {
    url: `${baseUrl}/jobs/remote`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.9,
  }

  // Travel/Locum jobs page
  const travelJobsPage = {
    url: `${baseUrl}/jobs/travel`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.9,
  }

  // Salary guide page
  const salaryGuidePage = {
    url: `${baseUrl}/salary-guide`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.9,
  }

  // Resources page
  const resourcesPage = {
    url: `${baseUrl}/resources`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }

  // Locations hub page
  const locationsPage = {
    url: `${baseUrl}/jobs/locations`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }

  // All US state pages
  const statePages = US_STATES.map(state => ({
    url: `${baseUrl}/jobs/state/${state}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))


  try {
    // Blog Posts
    const blogSlugs = getPostSlugs();
    const blogPages = blogSlugs
      .filter((slug: string) => slug.endsWith('.mdx'))
      .map((slug: string) => ({
        url: `${baseUrl}/blog/${slug.replace(/\.mdx$/, '')}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }));

    // Dynamic job pages
    const jobs = await prisma.job.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        title: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000, // Limit to most recent 1000 jobs
    })

    const jobPages = jobs.map((job: JobSitemapData) => {
      // Create slug from title and ID
      const slug = `${job.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${job.id}`
      return {
        url: `${baseUrl}/jobs/${slug}`,
        lastModified: job.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }
    })

    // Get top cities with jobs (cities with most job postings)
    const topCities = await prisma.job.groupBy({
      by: ['city'],
      where: {
        isPublished: true,
        city: {
          not: null,
        },
      },
      _count: {
        city: true,
      },
      orderBy: {
        _count: {
          city: 'desc',
        },
      },
      take: 100, // Top 100 cities
    })

    const cityPages = topCities
      .filter(city => city.city) // Filter out nulls
      .map(city => ({
        url: `${baseUrl}/jobs/city/${city.city!.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }))

    return [
      ...staticPages,
      remoteJobsPage,
      travelJobsPage,
      salaryGuidePage,
      resourcesPage,
      locationsPage,
      ...statePages,
      ...cityPages,
      ...jobPages,
      ...blogPages,
    ]
  } catch (error) {
    console.error('Error generating sitemap, returning static pages only:', error)
    // Return static pages and SEO landing pages if database is unavailable during build
    return [
      ...staticPages,
      remoteJobsPage,
      travelJobsPage,
      salaryGuidePage,
      resourcesPage,
      locationsPage,
      ...statePages,
    ]
  }
}
