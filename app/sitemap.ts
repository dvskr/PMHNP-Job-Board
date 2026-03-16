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

const SETTING_SLUGS = ['remote', 'telehealth', 'inpatient', 'outpatient', 'travel']
const SPECIALTY_SLUGS = ['addiction', 'child-adolescent', 'substance-abuse', 'new-grad', 'per-diem']
const JOB_TYPE_SLUGS = ['full-time', 'part-time', 'contract']
const EXPERIENCE_SLUGS = ['entry-level', 'mid-career', 'senior']
const EMPLOYER_SLUGS = ['hospital', 'private-practice', 'community-health', 'va']
const POPULATION_SLUGS = ['geriatric', 'veterans', 'lgbtq', 'crisis']
const ALL_CATEGORY_SLUGS = [...SETTING_SLUGS, ...SPECIALTY_SLUGS, ...JOB_TYPE_SLUGS, ...EXPERIENCE_SLUGS, ...EMPLOYER_SLUGS, ...POPULATION_SLUGS]

// State name-to-code lookup for slug generation
const STATE_NAME_TO_CODE: Record<string, string> = {
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

/**
 * Primary sitemap — core pages, jobs, blog, state pages, category×state pages.
 * Category × City pages are served via /api/sitemaps/cities/[batch] (see API routes).
 * This keeps each sitemap under Google's 50K URL limit.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com'

  let latestJobDate = new Date('2026-03-01');
  try {
    const latestJob = await prisma.job.findFirst({
      where: { isPublished: true },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });
    if (latestJob) latestJobDate = latestJob.updatedAt;
  } catch { /* fallback */ }

  const STATIC_CONTENT_DATE = new Date('2026-02-20');

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: latestJobDate, changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/jobs`, lastModified: latestJobDate, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${baseUrl}/blog`, lastModified: latestJobDate, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/post-job`, lastModified: STATIC_CONTENT_DATE, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/for-employers`, lastModified: STATIC_CONTENT_DATE, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/for-job-seekers`, lastModified: STATIC_CONTENT_DATE, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/about`, lastModified: STATIC_CONTENT_DATE, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/faq`, lastModified: STATIC_CONTENT_DATE, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/contact`, lastModified: STATIC_CONTENT_DATE, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/job-alerts`, lastModified: STATIC_CONTENT_DATE, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/terms`, lastModified: STATIC_CONTENT_DATE, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified: STATIC_CONTENT_DATE, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/pricing`, lastModified: STATIC_CONTENT_DATE, changeFrequency: 'monthly', priority: 0.7 },
  ]

  // Category landing pages
  const categoryLandingPages: MetadataRoute.Sitemap = ALL_CATEGORY_SLUGS.map(slug => ({
    url: `${baseUrl}/jobs/${slug}`,
    lastModified: latestJobDate,
    changeFrequency: 'daily',
    priority: 0.9,
  }))

  // Other landing pages
  const landingPages: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/salary-guide`, lastModified: STATIC_CONTENT_DATE, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/resources`, lastModified: STATIC_CONTENT_DATE, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/jobs/locations`, lastModified: latestJobDate, changeFrequency: 'weekly', priority: 0.8 },
  ]

  // State pages
  const statePages: MetadataRoute.Sitemap = US_STATES.map(state => ({
    url: `${baseUrl}/jobs/state/${state}`,
    lastModified: latestJobDate,
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  // Salary guide state pages
  const salaryGuideStatePages: MetadataRoute.Sitemap = US_STATES.map(state => ({
    url: `${baseUrl}/salary-guide/${state}`,
    lastModified: latestJobDate,
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  // Category × State pages (13 categories × 51 states = 663 pages)
  const categoryStatePages: MetadataRoute.Sitemap = ALL_CATEGORY_SLUGS.flatMap(category =>
    US_STATES.map(state => ({
      url: `${baseUrl}/jobs/${category}/${state}`,
      lastModified: latestJobDate,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))
  )

  try {
    // Blog pages
    const blogSlugs = await getAllPublishedSlugs();
    const blogPages: MetadataRoute.Sitemap = blogSlugs.map((post) => ({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: new Date(post.updated_at),
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

    // Job detail pages
    const jobs = await prisma.job.findMany({
      where: { isPublished: true },
      select: { id: true, title: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    })

    const jobPages: MetadataRoute.Sitemap = jobs.map((job: JobSitemapData) => {
      const slug = `${job.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${job.id}`
      return {
        url: `${baseUrl}/jobs/${slug}`,
        lastModified: job.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.8,
      }
    })

    // Top city pages (DB-driven)
    const topCities = await prisma.job.groupBy({
      by: ['city', 'state'],
      where: { isPublished: true, city: { not: null }, state: { not: null } },
      _count: { city: true },
      orderBy: { _count: { city: 'desc' } },
      take: 200,
    })

    const cityPages: MetadataRoute.Sitemap = topCities
      .filter(c => c.city && c.state)
      .map(c => {
        const stateVal = c.state!.trim();
        const code = stateVal.length === 2 ? stateVal.toUpperCase() : STATE_NAME_TO_CODE[stateVal] || null;
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
      ...categoryLandingPages,
      ...landingPages,
      ...statePages,
      ...salaryGuideStatePages,
      ...categoryStatePages,
      ...cityPages,
      ...jobPages,
      ...blogPages,
    ]
  } catch (error) {
    logger.error('Error generating sitemap, returning static pages only:', error)
    return [
      ...staticPages,
      ...categoryLandingPages,
      ...landingPages,
      ...statePages,
      ...salaryGuideStatePages,
      ...categoryStatePages,
    ]
  }
}
