import { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getAllPublishedSlugs } from '@/lib/blog'
import { getAllMetroSlugs } from '@/lib/metro-data'
import { activeIndexableJobWhere } from '@/lib/active-job-filter'
import { MIN_JOBS_FOR_CATEGORY_CITY } from '@/lib/pseo/render-gate'
import { PRIMARY_SITEMAP_CATEGORY_SLUGS } from '@/lib/pseo/jobs-segments-edge'
import { CITIES } from '@/lib/pseo/city-data/cities'

// GSC Fix: Cache sitemap for 1 hour. Without this, every Googlebot request to
// /sitemap.xml triggers a full DB scan across jobs, companies, and blog tables.
export const revalidate = 3600;

const METRO_SLUGS = getAllMetroSlugs();
// GSC Fix (2026-07 audit P2.7): metro slugs must be excluded from the
// /jobs/city/* section — app/jobs/city/[slug]/page.tsx 308-redirects metro
// slugs to /jobs/metro/{slug}, and the sitemap already lists the metro URLs.
// Advertising both meant 12 permanent "Submitted URL redirected" entries.
const METRO_SLUG_SET = new Set<string>(METRO_SLUGS);

// NOTE: the ACTIVE_JOB_WHERE filter is built per render inside sitemap() —
// building it at module scope froze `now` at cold start, so a long-lived
// server instance kept including jobs that had expired since boot.

// GSC Fix (2026-07 audit P2.8): mirror the CITIES-registry + population gate
// that /api/sitemaps/cities/[batch] applies. The raw job groupBy alone let
// location-parsing noise (neighborhood-grade entities, malformed slugs) into
// the sitemap during a transient ≥3-job window, after which they churned to
// 404/crawled-not-indexed.
const CITY_POPULATION_LOOKUP = new Map<string, number>(
  CITIES.map(c => [c.slug, c.population])
);
const MIN_SITEMAP_POPULATION = 10000;

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

// Category landing slugs — derived from the JOBS_TAXONOMY registry in
// lib/pseo/jobs-segments-edge.ts (single source of truth for the /jobs
// category taxonomy; drift-guarded by tests/seo/jobs-segments-drift.test.ts).
// Only slugs flagged inPrimarySitemap are emitted here — substance-abuse is
// deliberately excluded (canonicalized to /jobs/addiction; see the registry).
const ALL_CATEGORY_SLUGS = PRIMARY_SITEMAP_CATEGORY_SLUGS

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

  // Shared filter: published, not expired, and not a repeated dead link (S6).
  // Built per render — see the module-scope NOTE above. Deliberately
  // UNBUFFERED (no expiryBufferDays): these aggregates drive the city/company
  // section gates, which must agree with the page-level render gates.
  const ACTIVE_JOB_WHERE = activeIndexableJobWhere();

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
  // The /tools suite shipped later than the last sitewide static-content
  // audit date above — carrying STATIC_CONTENT_DATE would claim these pages
  // existed ~11 weeks before they did.
  const TOOLS_LAUNCH_DATE = new Date('2026-07-23');

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
    // /job-alerts removed from sitemap (audit 15 thin-pages CRITICAL):
    // page is a bare subscription form (~240 words of UI labels). Now
    // noindexed via app/job-alerts/layout.tsx. Leaving the sitemap entry
    // in place would surface as a "Submitted URL marked noindex" warning
    // in GSC. Footer link on every page provides the discovery path.
    { url: `${baseUrl}/terms`, lastModified: STATIC_CONTENT_DATE, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified: STATIC_CONTENT_DATE, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/pricing`, lastModified: STATIC_CONTENT_DATE, changeFrequency: 'monthly', priority: 0.7 },
    // Content hub pages
    // Sitemap submits the canonical destination directly. Previously /new-grad
    // was advertised here but next.config.ts permanently redirects it to
    // /jobs/new-grad — Google logs that as "Submitted URL redirected" in GSC
    // and burns crawl budget on a hop that yields no new content.
    { url: `${baseUrl}/jobs/new-grad`, lastModified: latestJobDate, changeFrequency: 'weekly', priority: 0.9 },
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
    // Free candidate tools (launched 2026-07-23 — STATIC_CONTENT_DATE
    // predates them, so static tools carry their own launch date). The two
    // data-backed tools re-render with the job set and carry latestJobDate;
    // page ISR is daily, so that lastmod can lead the cached page by up to
    // 24h — accepted granularity, same as the salary-guide state pages.
    { url: `${baseUrl}/tools`, lastModified: TOOLS_LAUNCH_DATE, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/tools/offer-analyzer`, lastModified: latestJobDate, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/tools/salary-converter`, lastModified: latestJobDate, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/tools/1099-vs-w2-calculator`, lastModified: TOOLS_LAUNCH_DATE, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/tools/practice-authority-map`, lastModified: TOOLS_LAUNCH_DATE, changeFrequency: 'monthly', priority: 0.7 },
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
  // totalJobs ≥ MIN_JOBS_FOR_CATEGORY_CITY). Keep this empty here to avoid
  // duplicating URLs across sitemaps — Google treats duplicate <loc> entries
  // across sitemap files as a quality signal hit.
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
      _max: { updatedAt: true },
    });
    // Mirrors the /salary-guide/[state] gate: the page notFound()s below 3
    // clean disclosed-salary rows, so the sitemap must not advertise states
    // under that floor (the WHERE approximates cleanSalaryRows' estimated +
    // both-bounds gates; the ratio/sanity quarantine can't run in SQL, so a
    // state right at the floor may rarely still 404 until the next crawl).
    const stateSalaryCounts = await prisma.job.groupBy({
      by: ['state'],
      where: {
        ...ACTIVE_JOB_WHERE,
        state: { not: null },
        normalizedMinSalary: { not: null },
        normalizedMaxSalary: { not: null },
        salaryIsEstimated: false,
      },
      _count: { state: true },
      _max: { updatedAt: true },
    });
    const slugify = (s: string) => s.toLowerCase().replace(/\s+/g, '-');
    const statesWithJobs = new Set(stateJobCounts.map(r => slugify((r.state || '').trim())));
    const statesWithSalary = new Set(
      stateSalaryCounts.filter(r => r._count.state >= 3).map(r => slugify((r.state || '').trim()))
    );
    // GSC Fix (2026-07 audit P2.5): per-entity lastmod. Previously every
    // state/city/company entry carried the single sitewide latestJobDate
    // (bumped every ≤4h by ingest), claiming perpetual freshness for pages
    // whose jobs may not have changed in weeks — eroding Google's trust in
    // lastmod exactly where it matters most (the churning job-detail
    // sitemaps). High-churn listing hubs (homepage, /jobs, category landings,
    // metros) keep latestJobDate: they genuinely change with every ingest.
    const stateLastMod = new Map<string, Date>();
    for (const r of stateJobCounts) {
      if (r._max?.updatedAt) stateLastMod.set(slugify((r.state || '').trim()), r._max.updatedAt);
    }
    const stateSalaryLastMod = new Map<string, Date>();
    for (const r of stateSalaryCounts) {
      if (r._max?.updatedAt) stateSalaryLastMod.set(slugify((r.state || '').trim()), r._max.updatedAt);
    }
    statePages = US_STATES.filter(s => statesWithJobs.has(s)).map(state => ({
      url: `${baseUrl}/jobs/state/${state}`,
      lastModified: stateLastMod.get(state) ?? latestJobDate,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
    salaryGuideStatePages = US_STATES.filter(s => statesWithSalary.has(s)).map(state => ({
      url: `${baseUrl}/salary-guide/${state}`,
      lastModified: stateSalaryLastMod.get(state) ?? latestJobDate,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));

    // Top city pages (DB-driven, only active non-expired jobs).
    //
    // Bounded with `take: 2000` so cold-cache sitemap regeneration can't
    // pull an unbounded city/state distribution into memory if the dataset
    // grows. 2000 is well above the 28 city-eligible taxonomies × any
    // plausible per-city threshold and still loads in milliseconds; pages
    // beyond the cap are extremely thin (<3 jobs) and would be filtered
    // out anyway by the downstream MIN_JOBS_FOR_CATEGORY_CITY guard.
    const topCities = await prisma.job.groupBy({
      by: ['city', 'state'],
      where: { ...ACTIVE_JOB_WHERE, city: { not: null }, state: { not: null } },
      _count: { city: true },
      _max: { updatedAt: true },
      orderBy: { _count: { city: 'desc' } },
      take: 2000,
    })

    const cityPages: MetadataRoute.Sitemap = topCities
      .filter(c => c.city && c.state)
      // GSC Fix: Only include cities with ≥3 active jobs to prevent submitting
      // thin city pages that get flagged as soft 404 or crawled-not-indexed.
      // Threshold imported from lib/pseo/render-gate.ts (SSOT with page gates).
      .filter(c => c._count.city >= MIN_JOBS_FOR_CATEGORY_CITY)
      .map(c => {
        const stateVal = c.state!.trim();
        const code = stateVal.length === 2 ? stateVal.toUpperCase() : STATE_NAME_TO_CODE[stateVal] || null;
        if (!code) return null;
        const slug = `${c.city!.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${code.toLowerCase()}`;
        // P2.7: metro slugs 308 to /jobs/metro/* — never advertise a
        // redirecting URL (the metro URLs are already in staticPages).
        if (METRO_SLUG_SET.has(slug)) return null;
        // P2.8: CITIES-registry + population gate — mirrors
        // /api/sitemaps/cities/[batch] so junk location-parse entities
        // can't be advertised during a transient ≥3-job window.
        const population = CITY_POPULATION_LOOKUP.get(slug);
        if (population === undefined || population < MIN_SITEMAP_POPULATION) return null;
        return {
          url: `${baseUrl}/jobs/city/${slug}`,
          lastModified: c._max?.updatedAt ?? latestJobDate,
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
        // P2.5: latest active job per company drives that company's lastmod.
        jobs: {
          where: ACTIVE_JOB_WHERE,
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { updatedAt: true },
        },
      },
    });
    const companyPages: MetadataRoute.Sitemap = companiesWithJobs
      // Only companies with ≥8 active jobs (tightened from 5 to reduce thin
      // pages). Mirrors MIN_COMPANY_JOBS_FOR_INDEX in app/companies/[slug]/
      // page.tsx (noindex below 8) — keep the two in lockstep.
      .filter(c => c._count.jobs >= 8)
      .map(c => ({
        url: `${baseUrl}/companies/${c.normalizedName}`,
        lastModified: c.jobs?.[0]?.updatedAt ?? latestJobDate,
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
