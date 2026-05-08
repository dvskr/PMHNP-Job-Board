import { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getAllPublishedSlugs } from '@/lib/blog'
import { getAllMetroSlugs } from '@/lib/metro-data'

// GSC Fix: Cache sitemap for 1 hour. Without this, every Googlebot request to
// /sitemap.xml triggers a full DB scan across jobs, companies, and blog tables.
export const revalidate = 3600;

const METRO_SLUGS = getAllMetroSlugs();

// Shared filter: published AND not expired
const ACTIVE_JOB_WHERE = {
  isPublished: true,
  OR: [
    { expiresAt: null },
    { expiresAt: { gt: new Date() } },
  ],
};

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
const SPECIALTY_SLUGS = ['addiction', 'child-adolescent', 'substance-abuse', 'new-grad', 'per-diem', 'locum-tenens', 'correctional', '1099']
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

  // GSC Fix (P1.4): use the actual latest job date, or "now" as a safe live
  // fallback. Previously hard-coded "2026-03-01" — a stale stamp made every
  // sitemap entry look 2+ months old and signaled "this site isn't being
  // maintained" to Google. The outer try/catch at the bottom of this function
  // still catches DB-wide failure and returns a static-only sitemap.
  let latestJobDate = new Date();
  const latestJob = await prisma.job.findFirst({
    where: { isPublished: true },
    orderBy: { updatedAt: 'desc' },
    select: { updatedAt: true },
  });
  if (latestJob) latestJobDate = latestJob.updatedAt;

  const STATIC_CONTENT_DATE = new Date('2026-05-04');

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
    // Content hub pages
    { url: `${baseUrl}/new-grad`, lastModified: latestJobDate, changeFrequency: 'weekly', priority: 0.9 },
    // Metro landing pages
    ...METRO_SLUGS.map(slug => ({
      url: `${baseUrl}/jobs/metro/${slug}`,
      lastModified: latestJobDate,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
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
    { url: `${baseUrl}/resources/fpa-guide`, lastModified: STATIC_CONTENT_DATE, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/resources/private-practice-guide`, lastModified: STATIC_CONTENT_DATE, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/resources/1099-vs-w2`, lastModified: STATIC_CONTENT_DATE, changeFrequency: 'monthly', priority: 0.8 },
  ]

  // State pages — DB-gated below in the try block so empty states never
  // ship to Google. These `let`-bound defaults are the degraded-mode
  // fallback used by the outer catch when the DB is unhealthy.
  let statePages: MetadataRoute.Sitemap = US_STATES.map(state => ({
    url: `${baseUrl}/jobs/state/${state}`,
    lastModified: latestJobDate,
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  // Salary guide state pages — same gating treatment.
  let salaryGuideStatePages: MetadataRoute.Sitemap = US_STATES.map(state => ({
    url: `${baseUrl}/salary-guide/${state}`,
    lastModified: latestJobDate,
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  // Category × State pages — handled by /api/sitemaps/cities/[batch] (which
  // emits both category×city AND setting×state URLs via pseoStats with
  // totalJobs ≥ 1). Keep this empty here to avoid duplicating URLs across
  // sitemaps — Google treats duplicate <loc> entries across sitemap files as
  // a quality signal hit.
  const categoryStatePages: MetadataRoute.Sitemap = [];

  try {
    // Blog pages
    const blogSlugs = await getAllPublishedSlugs();
    const blogPages: MetadataRoute.Sitemap = blogSlugs.map((post) => ({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: new Date(post.updated_at),
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

    // GSC Fix (P3.8): Job-detail URLs are now served by /api/sitemaps/jobs/[batch]
    // (BATCH_SIZE=25000) and listed in /api/sitemaps/index. Keeping them out of
    // the primary sitemap leaves headroom under Google's 50K-URL cap regardless
    // of ingestion-volume bumps. We still need an active-jobs count for the
    // per-section sanity floor below.
    const activeJobCount = await prisma.job.count({ where: ACTIVE_JOB_WHERE });

    // GSC Fix: gate state and salary-guide-state URLs on actual job presence.
    // The page handlers now notFound() on empty states, but the sitemap also
    // needs to stop advertising them — otherwise Google keeps re-crawling
    // and the URL bounces between "indexed → 404 → not indexed" until the
    // state has data again. The state.toLowerCase().replace pattern matches
    // US_STATES slugs (e.g. "Wyoming" → "wyoming", "New York" → "new-york").
    const stateJobCounts = await prisma.job.groupBy({
      by: ['state'],
      where: { ...ACTIVE_JOB_WHERE, state: { not: null } },
      _count: { state: true },
    });
    const stateSalaryCounts = await prisma.job.groupBy({
      by: ['state'],
      where: { ...ACTIVE_JOB_WHERE, state: { not: null }, normalizedMinSalary: { not: null } },
      _count: { state: true },
    });
    const slugify = (s: string) => s.toLowerCase().replace(/\s+/g, '-');
    const statesWithJobs = new Set(stateJobCounts.map(r => slugify((r.state || '').trim())));
    const statesWithSalary = new Set(stateSalaryCounts.map(r => slugify((r.state || '').trim())));
    statePages = US_STATES.filter(s => statesWithJobs.has(s)).map(state => ({
      url: `${baseUrl}/jobs/state/${state}`,
      lastModified: latestJobDate,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
    salaryGuideStatePages = US_STATES.filter(s => statesWithSalary.has(s)).map(state => ({
      url: `${baseUrl}/salary-guide/${state}`,
      lastModified: latestJobDate,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));

    // Top city pages (DB-driven, only active non-expired jobs)
    const topCities = await prisma.job.groupBy({
      by: ['city', 'state'],
      where: { ...ACTIVE_JOB_WHERE, city: { not: null }, state: { not: null } },
      _count: { city: true },
      orderBy: { _count: { city: 'desc' } },
    })

    const cityPages: MetadataRoute.Sitemap = topCities
      .filter(c => c.city && c.state)
      // GSC Fix: Only include cities with ≥3 active jobs to prevent submitting
      // thin city pages that get flagged as soft 404 or crawled-not-indexed.
      .filter(c => c._count.city >= 3)
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

    // Company pages — only include companies that:
    // 1. Actually exist in the Company table (so normalizedName matches what the page uses)
    // 2. Have ≥5 active jobs (fewer = thin page → GSC soft 404)
    // GSC Fix: Previously generated slugs from job.employer via regex, causing slug mismatches
    // with Company.normalizedName → 2,265 dead 404s in GSC.
    const companiesWithJobs = await prisma.company.findMany({
      where: {
        jobs: {
          some: ACTIVE_JOB_WHERE,
        },
      },
      select: {
        normalizedName: true,
        _count: {
          select: {
            jobs: {
              where: ACTIVE_JOB_WHERE,
            },
          },
        },
      },
    });
    const companyPages: MetadataRoute.Sitemap = companiesWithJobs
      .filter(c => c._count.jobs >= 8) // Only companies with ≥8 active jobs (tightened from 5 to reduce thin pages)
      .map(c => ({
        url: `${baseUrl}/companies/${c.normalizedName}`,
        lastModified: latestJobDate,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }))

    const all = [
      ...staticPages,
      ...categoryLandingPages,
      ...landingPages,
      ...statePages,
      ...salaryGuideStatePages,
      ...categoryStatePages,
      ...cityPages,
      ...companyPages,
      ...blogPages,
      // jobPages intentionally omitted — served by /api/sitemaps/jobs/[batch]
    ]

    // GSC Fix (P3.8): sitemap budget guard. Google's per-sitemap limit is
    // 50,000 URLs. We exceed it silently, the entire sitemap is rejected and
    // ALL pages stop being recrawled. Log loudly when we approach the cap so
    // ops can split into batches before that happens.
    if (all.length > 40000) {
      logger.warn(`[sitemap] Primary sitemap is ${all.length} entries — approaching Google's 50k limit. Plan to split job pages into /api/sitemaps/jobs/[batch] before exceeding 48000.`);
    }
    if (all.length > 48000) {
      logger.error(`[sitemap] Primary sitemap is ${all.length} entries — Google may reject the whole sitemap (50k cap). Splitting job pages into batches is now mandatory.`);
    }
    // Per-section sanity floors — if any of these collapse to 0 unexpectedly,
    // the DB query likely silently failed and we'd be poisoning Google with
    // a near-empty sitemap. Better to fail-fast and let the outer catch return
    // the static-only sitemap.
    if (activeJobCount === 0) {
      throw new Error('Sitemap: 0 active jobs returned — DB likely degraded; aborting to avoid empty sitemap.');
    }

    return all
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
