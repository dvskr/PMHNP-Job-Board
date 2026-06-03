/**
 * Sitemap Index — lists the primary sitemap and all city sitemap batches.
 *
 * DB-driven: batch count is calculated from pseoStats (matching the per-batch
 * route at /api/sitemaps/cities/[batch]) so the index and batches always
 * agree on how many URLs are emitted. The two routes share thresholds and
 * gating so a stale index never points at empty batches.
 *
 * Route: /api/sitemaps/index
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { activeIndexableJobWhere } from '@/lib/active-job-filter';
import { CITIES } from '@/lib/pseo/city-data/cities';

// Must match SITEMAP_CATEGORIES in cities/[batch]/route.ts
const SITEMAP_CATEGORIES = [
  'remote', 'telehealth', 'inpatient', 'outpatient', 'travel',
  'full-time', 'part-time', 'contract',
  'addiction', 'new-grad', '1099', 'behavioral-health', 'correctional',
];
const SITEMAP_CATEGORY_SET = new Set(SITEMAP_CATEGORIES);
const CITY_POPULATION_LOOKUP = new Map<string, number>(
  CITIES.map(c => [c.slug, c.population])
);

const BATCH_SIZE = 10000;
// Mirrors the constant in /api/sitemaps/jobs/[batch]/route.ts — must stay
// in lockstep so the index reports the right batch count.
const JOB_BATCH_SIZE = 25000;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

// Mirror of thresholds + staleness window in cities/[batch]/route.ts.
// If you change either, change both — the two routes must agree exactly.
const MIN_SITEMAP_JOBS = 3;
const MIN_SITEMAP_POPULATION = 10000;
const PSEO_STALENESS_HOURS = 36;

export async function GET() {
  // SEO Fix #17: lastmod must reflect actual freshness, not "today". Using
  // today's date on every request signals to Google that every child sitemap
  // changed today — when most haven't — eroding the credibility of lastmod
  // signals across the entire site. Anchor to the latest job updatedAt with
  // the request day as a conservative ceiling.
  let lastmod = new Date().toISOString().split('T')[0];
  try {
    const latestJob = await prisma.job.findFirst({
      where: { isPublished: true },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });
    if (latestJob?.updatedAt) {
      lastmod = latestJob.updatedAt.toISOString().split('T')[0];
    }
  } catch {
    // fall back to today; underspecifying lastmod is safer than over-claiming
  }

  // DB-driven: count how many URLs the batch route will actually emit.
  // Must match the pruning logic in cities/[batch]/route.ts exactly — both
  // routes now query pseoStats with identical thresholds so the index never
  // over- or under-reports batch count.
  const freshnessThreshold = new Date(Date.now() - PSEO_STALENESS_HOURS * 60 * 60 * 1000);
  let totalUrls = 0;
  try {
    // Category × City: pseoStats.totalJobs ≥ MIN_SITEMAP_JOBS, fresh, valid
    // category, city population ≥ floor.
    const categoryCityRows = await prisma.pseoStats.findMany({
      where: {
        type: 'category-city',
        totalJobs: { gte: MIN_SITEMAP_JOBS },
        updatedAt: { gte: freshnessThreshold },
      },
      select: { categorySlug: true, locationSlug: true },
    });
    for (const row of categoryCityRows) {
      if (!SITEMAP_CATEGORY_SET.has(row.categorySlug)) continue;
      const population = CITY_POPULATION_LOOKUP.get(row.locationSlug);
      if (population === undefined || population < MIN_SITEMAP_POPULATION) continue;
      totalUrls++;
    }

    // Setting × State: pseoStats.totalJobs ≥ 1 and fresh.
    const settingStateCount = await prisma.pseoStats.count({
      where: {
        type: 'setting-state',
        totalJobs: { gte: 1 },
        updatedAt: { gte: freshnessThreshold },
      },
    });
    totalUrls += settingStateCount;
  } catch {
    // Fallback: conservative estimate. Better to under-list batches than
    // to advertise empty ones.
    totalUrls = SITEMAP_CATEGORIES.length * Math.min(CITIES.length, 500);
  }

  const totalBatches = Math.max(1, Math.ceil(totalUrls / BATCH_SIZE));

  // GSC Fix (P3.8): jobs-batch count. Splitting job-detail URLs into
  // /api/sitemaps/jobs/{N} keeps each file under the 50K-URL cap so the
  // sitemap is never rejected wholesale once ingestion volume scales.
  let activeJobCount = 0;
  try {
    // #3 fix: use the SAME filter the batch route uses (includes the
    // healthConsecutiveMissing dead-link gate) so the index never advertises
    // more job batches than /api/sitemaps/jobs/[batch] actually serves.
    activeJobCount = await prisma.job.count({ where: activeIndexableJobWhere() });
  } catch {
    // Fall back to a single batch — better to under-list than to hide jobs entirely.
    activeJobCount = 0;
  }
  const totalJobBatches = activeJobCount > 0
    ? Math.max(1, Math.ceil(activeJobCount / JOB_BATCH_SIZE))
    : 0;

  // Build sitemap entries: 1 primary + N city batches + M job batches
  const sitemaps = [
    `  <sitemap>
    <loc>${BASE_URL}/sitemap.xml</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>`,
  ];

  for (let i = 0; i < totalBatches; i++) {
    sitemaps.push(`  <sitemap>
    <loc>${BASE_URL}/api/sitemaps/cities/${i}</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>`);
  }

  for (let i = 0; i < totalJobBatches; i++) {
    sitemaps.push(`  <sitemap>
    <loc>${BASE_URL}/api/sitemaps/jobs/${i}</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.join('\n')}
</sitemapindex>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
