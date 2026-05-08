/**
 * Batched city sitemap — serves category × city URLs in batches of 10,000.
 * 
 * DB-DRIVEN: Only emits URLs where actual published, non-expired jobs exist
 * for the category+city+state combination. This prevents submitting tens of
 * thousands of empty pages to Google (which was the root cause of most GSC
 * coverage issues).
 * 
 * Phase 6: Expanded from 8 to 13 categories (added addiction, new-grad,
 * 1099, behavioral-health, correctional). Also includes state-level URLs.
 * 
 * Routes:
 *   /api/sitemaps/cities/0 → first 10K URLs
 *   /api/sitemaps/cities/1 → next 10K URLs
 *   etc.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CITIES } from '@/lib/pseo/city-data/cities';
import { getAllSettingSlugs, getAllStateSlugs } from '@/lib/pseo/setting-state-config';

// Must match SITEMAP_CATEGORIES in index/route.ts
const SITEMAP_CATEGORIES = [
  'remote', 'telehealth', 'inpatient', 'outpatient', 'travel',
  'full-time', 'part-time', 'contract',
  'addiction', 'new-grad', '1099', 'behavioral-health', 'correctional',
];

const BATCH_SIZE = 10000;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

// Build a lookup: state name → Map of city → job count (for quality filtering)
async function getCitiesWithJobCounts(): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  
  const citiesWithJobs = await prisma.job.groupBy({
    by: ['city', 'state'],
    where: {
      isPublished: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
      city: { not: null },
      state: { not: null },
    },
    _count: { city: true },
  });

  for (const row of citiesWithJobs) {
    if (!row.city || !row.state) continue;
    const stateKey = row.state.toLowerCase().trim();
    const cityKey = row.city.toLowerCase().trim();
    if (!result.has(stateKey)) result.set(stateKey, new Map());
    result.get(stateKey)!.set(cityKey, row._count.city);
  }

  return result;
}

// Build city slug → state name lookup from CITIES data
const CITY_STATE_LOOKUP = new Map(
  CITIES.map(c => [c.slug, { name: c.name.toLowerCase(), state: c.state.toLowerCase(), population: c.population }])
);

// ═══ DYNAMIC SITEMAP PRUNING ═══
// Only emit URLs that meet quality thresholds:
// 1. City must have ≥ MIN_SITEMAP_JOBS jobs (matches page-level quality gate)
// 2. City must have population ≥ 10,000 (small towns won't rank)
// This prevents GSC "discovered-not-indexed" bloat.
const MIN_SITEMAP_JOBS = 3;
const MIN_SITEMAP_POPULATION = 10000;

// Generate only URLs where sufficient jobs exist in quality cities
// Also includes state-level pSEO URLs (/jobs/{setting}/{state})
async function getActiveCategoryCityUrls(): Promise<string[]> {
  const citiesWithJobs = await getCitiesWithJobCounts();
  const urls: string[] = [];

  // Category × City URLs
  for (const category of SITEMAP_CATEGORIES) {
    for (const city of CITIES) {
      // Population gate — skip small towns
      if (city.population < MIN_SITEMAP_POPULATION) continue;

      const stateKey = city.state.toLowerCase().trim();
      const cityKey = city.name.toLowerCase().trim();
      const stateCities = citiesWithJobs.get(stateKey);
      const jobCount = stateCities?.get(cityKey) || 0;

      // Job count gate — only include if enough jobs to be indexed
      if (jobCount >= MIN_SITEMAP_JOBS) {
        urls.push(`${BASE_URL}/jobs/${category}/city/${city.slug}`);
      }
    }
  }

  // Setting × State URLs — quality-gated via pseoStats.
  // GSC Fix (P1.1): previously emitted all 13 settings × 51 states = 663 URLs
  // unconditionally. Most had 0 matching jobs and 404'd, polluting GSC with
  // "Not found" entries. Now only emit URLs where ≥1 active job exists.
  // pseoStats is pre-aggregated by /api/cron/aggregate-pseo (every 12h).
  // SEO Fix #18: gate on freshness too. If the aggregator has been failing
  // and pseoStats is >36h stale, those rows might advertise pages whose
  // underlying jobs already expired. The 36h window is 3x the 12h cron
  // cadence — enough headroom for a single missed run, strict enough to
  // catch sustained failures before Google sees dead URLs.
  const PSEO_STALENESS_HOURS = 36;
  const freshnessThreshold = new Date(Date.now() - PSEO_STALENESS_HOURS * 60 * 60 * 1000);
  const settingSlugs = new Set(getAllSettingSlugs());
  const validStateSlugs = new Set(getAllStateSlugs());
  try {
    const settingStateRows = await prisma.pseoStats.findMany({
      where: {
        type: 'setting-state',
        totalJobs: { gte: 1 },
        updatedAt: { gte: freshnessThreshold },
      },
      select: { categorySlug: true, locationSlug: true },
    });
    for (const row of settingStateRows) {
      // Defense in depth: ignore stale rows whose slugs are no longer registered.
      if (!settingSlugs.has(row.categorySlug)) continue;
      if (!validStateSlugs.has(row.locationSlug)) continue;
      urls.push(`${BASE_URL}/jobs/${row.categorySlug}/${row.locationSlug}`);
    }
  } catch (err) {
    // If pseoStats is empty/unreachable, skip setting×state URLs entirely.
    // Better to omit than to flood the sitemap with dead URLs again.
    console.error('[sitemaps/cities] pseoStats lookup failed; omitting setting×state URLs:', err);
  }

  return urls;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batch: string }> }
) {
  const { batch: batchStr } = await params;
  const batchIndex = parseInt(batchStr, 10);

  if (isNaN(batchIndex) || batchIndex < 0) {
    return NextResponse.json({ error: 'Invalid batch index' }, { status: 404 });
  }

  // DB-driven: only emit URLs where jobs actually exist
  const allUrls = await getActiveCategoryCityUrls();
  const totalBatches = Math.ceil(allUrls.length / BATCH_SIZE) || 1;

  if (batchIndex >= totalBatches) {
    return NextResponse.json({ error: 'Invalid batch index' }, { status: 404 });
  }

  const start = batchIndex * BATCH_SIZE;
  const end = Math.min(start + BATCH_SIZE, allUrls.length);
  const batchUrls = allUrls.slice(start, end);

  const lastmod = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${batchUrls.map(url => `  <url>
    <loc>${url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>`).join('\n')}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
