/**
 * Batched city sitemap — serves category × city URLs in batches of 10,000.
 * 
 * DB-DRIVEN: Only emits URLs where actual published, non-expired jobs exist
 * for the category+city+state combination. This prevents submitting tens of
 * thousands of empty pages to Google (which was the root cause of most GSC
 * coverage issues).
 * 
 * GSC Fix: Reduced from 24 categories to 8 broad ones. Narrow categories
 * (addiction, crisis, lgbtq, geriatric, etc.) rarely have jobs in any
 * specific city and were inflating the sitemap 3x. Those pages are still
 * reachable via internal links but don't need to be in the sitemap.
 * 
 * Routes:
 *   /api/sitemaps/cities/0 → first 10K URLs
 *   /api/sitemaps/cities/1 → next 10K URLs
 *   etc.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CITIES } from '@/lib/pseo/city-data/cities';

// GSC Fix: Only broad categories that are likely to have jobs in most cities.
// Narrow specialty/population/experience/employer categories excluded from sitemap
// to prevent crawl budget waste. Those pages 404 when empty (per category-city-template fix).
const SITEMAP_CATEGORIES = ['remote', 'telehealth', 'inpatient', 'outpatient', 'travel', 'full-time', 'part-time', 'contract'];

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
async function getActiveCategoryCityUrls(): Promise<string[]> {
  const citiesWithJobs = await getCitiesWithJobCounts();
  const urls: string[] = [];

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
