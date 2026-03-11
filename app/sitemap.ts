import { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getAllPublishedSlugs } from '@/lib/blog'

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

  // Get the latest job update timestamp for dynamic pages
  // This gives Google an accurate lastmod instead of always "now"
  let latestJobDate = new Date('2026-03-01');
  try {
    const latestJob = await prisma.job.findFirst({
      where: { isPublished: true },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });
    if (latestJob) latestJobDate = latestJob.updatedAt;
  } catch { /* fallback to default */ }

  // Fixed dates for truly static pages (update these when content actually changes)
  const STATIC_CONTENT_DATE = new Date('2026-02-20');

  // Static pages — use fixed dates for rarely-changing content
  const staticPages = [
    {
      url: baseUrl,
      lastModified: latestJobDate, // Homepage shows latest jobs
      changeFrequency: 'daily' as const,
      priority: 1.0,
    },
    {
      url: `${baseUrl}/jobs`,
      lastModified: latestJobDate, // Job listing changes with new jobs
      changeFrequency: 'hourly' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: latestJobDate, // Updated when new posts are added
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/post-job`,
      lastModified: STATIC_CONTENT_DATE,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/for-employers`,
      lastModified: STATIC_CONTENT_DATE,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/for-job-seekers`,
      lastModified: STATIC_CONTENT_DATE,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: STATIC_CONTENT_DATE,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
    {
      url: `${baseUrl}/faq`,
      lastModified: STATIC_CONTENT_DATE,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: STATIC_CONTENT_DATE,
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    },
    {
      url: `${baseUrl}/job-alerts`,
      lastModified: STATIC_CONTENT_DATE,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: STATIC_CONTENT_DATE,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: STATIC_CONTENT_DATE,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    },
  ]

  // SEO Landing Pages — use latestJobDate since content changes with new jobs

  const remoteJobsPage = {
    url: `${baseUrl}/jobs/remote`,
    lastModified: latestJobDate,
    changeFrequency: 'daily' as const,
    priority: 0.9,
  }

  const travelJobsPage = {
    url: `${baseUrl}/jobs/travel`,
    lastModified: latestJobDate,
    changeFrequency: 'daily' as const,
    priority: 0.9,
  }

  const telehealthJobsPage = {
    url: `${baseUrl}/jobs/telehealth`,
    lastModified: latestJobDate,
    changeFrequency: 'daily' as const,
    priority: 0.9,
  }

  const newGradJobsPage = {
    url: `${baseUrl}/jobs/new-grad`,
    lastModified: latestJobDate,
    changeFrequency: 'daily' as const,
    priority: 0.9,
  }

  const perDiemJobsPage = {
    url: `${baseUrl}/jobs/per-diem`,
    lastModified: latestJobDate,
    changeFrequency: 'daily' as const,
    priority: 0.9,
  }

  const salaryGuidePage = {
    url: `${baseUrl}/salary-guide`,
    lastModified: STATIC_CONTENT_DATE,
    changeFrequency: 'weekly' as const,
    priority: 0.9,
  }

  const resourcesPage = {
    url: `${baseUrl}/resources`,
    lastModified: STATIC_CONTENT_DATE,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }

  const locationsPage = {
    url: `${baseUrl}/jobs/locations`,
    lastModified: latestJobDate,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }

  const inpatientJobsPage = {
    url: `${baseUrl}/jobs/inpatient`,
    lastModified: latestJobDate,
    changeFrequency: 'daily' as const,
    priority: 0.9,
  }

  const outpatientJobsPage = {
    url: `${baseUrl}/jobs/outpatient`,
    lastModified: latestJobDate,
    changeFrequency: 'daily' as const,
    priority: 0.9,
  }

  const substanceAbuseJobsPage = {
    url: `${baseUrl}/jobs/substance-abuse`,
    lastModified: latestJobDate,
    changeFrequency: 'daily' as const,
    priority: 0.9,
  }

  const childAdolescentJobsPage = {
    url: `${baseUrl}/jobs/child-adolescent`,
    lastModified: latestJobDate,
    changeFrequency: 'daily' as const,
    priority: 0.9,
  }

  // All US state pages — use latest job date
  const statePages = US_STATES.map(state => ({
    url: `${baseUrl}/jobs/state/${state}`,
    lastModified: latestJobDate,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  // Salary guide per-state pages (C15)
  const salaryGuideStatePages = US_STATES.map(state => ({
    url: `${baseUrl}/salary-guide/${state}`,
    lastModified: latestJobDate,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  // Pricing page
  const pricingPage = {
    url: `${baseUrl}/pricing`,
    lastModified: STATIC_CONTENT_DATE,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }


  try {
    // Blog Posts from Supabase
    const blogSlugs = await getAllPublishedSlugs();
    const blogPages = blogSlugs.map((post) => ({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: new Date(post.updated_at),
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
      take: 5000, // Increased from 1000 to cover more indexed pages
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
      by: ['city', 'state'],
      where: {
        isPublished: true,
        city: {
          not: null,
        },
        state: {
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
      take: 200, // Top 200 city+state combos
    })

    // State name-to-code lookup for slug generation
    const stateNameToCode: Record<string, string> = {
      'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
      'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
      'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
      'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
      'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
      'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
      'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
      'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
      'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
      'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
      'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
      'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
      'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
    }

    const cityPages = topCities
      .filter(c => c.city && c.state)
      .map(c => {
        // Resolve state code: check if state field is already a code (2 chars) or a full name
        const stateVal = c.state!.trim();
        const code = stateVal.length === 2
          ? stateVal.toUpperCase()
          : stateNameToCode[stateVal] || null;
        if (!code) return null;
        const slug = `${c.city!.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${code.toLowerCase()}`;
        return {
          url: `${baseUrl}/jobs/city/${slug}`,
          lastModified: latestJobDate,
          changeFrequency: 'weekly' as const,
          priority: 0.7,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)

    return [
      ...staticPages,
      remoteJobsPage,
      travelJobsPage,
      telehealthJobsPage,
      newGradJobsPage,
      perDiemJobsPage,
      salaryGuidePage,
      resourcesPage,
      locationsPage,
      inpatientJobsPage,
      outpatientJobsPage,
      substanceAbuseJobsPage,
      childAdolescentJobsPage,
      ...statePages,
      ...salaryGuideStatePages,
      pricingPage,
      ...cityPages,
      ...jobPages,
      ...blogPages,
    ]
  } catch (error) {
    logger.error('Error generating sitemap, returning static pages only:', error)
    // Return static pages and SEO landing pages if database is unavailable during build
    return [
      ...staticPages,
      remoteJobsPage,
      travelJobsPage,
      telehealthJobsPage,
      newGradJobsPage,
      perDiemJobsPage,
      salaryGuidePage,
      resourcesPage,
      locationsPage,
      inpatientJobsPage,
      outpatientJobsPage,
      substanceAbuseJobsPage,
      childAdolescentJobsPage,
      ...statePages,
      ...salaryGuideStatePages,
      pricingPage,
    ]
  }
}
