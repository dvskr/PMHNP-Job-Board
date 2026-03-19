/**
 * Batched city sitemap — serves category × city URLs in batches of 10,000.
 * 
 * DB-DRIVEN: Only emits URLs where actual published, non-expired jobs exist
 * for the category+city+state combination. This prevents submitting tens of
 * thousands of empty pages to Google (which was the root cause of most GSC
 * coverage issues).
 * 
 * Routes:
 *   /api/sitemaps/cities/0 → first 10K URLs
 *   /api/sitemaps/cities/1 → next 10K URLs
 *   etc.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CITIES } from '@/lib/pseo/city-data/cities';

const SETTING_SLUGS = ['remote', 'telehealth', 'inpatient', 'outpatient', 'travel'];
const SPECIALTY_SLUGS = ['addiction', 'child-adolescent', 'substance-abuse', 'new-grad', 'per-diem'];
const JOB_TYPE_SLUGS = ['full-time', 'part-time', 'contract'];
const EXPERIENCE_SLUGS = ['entry-level', 'mid-career', 'senior'];
const EMPLOYER_SLUGS = ['hospital', 'private-practice', 'community-health', 'va'];
const POPULATION_SLUGS = ['geriatric', 'veterans', 'lgbtq', 'crisis'];
const ALL_CATEGORIES = [...SETTING_SLUGS, ...SPECIALTY_SLUGS, ...JOB_TYPE_SLUGS, ...EXPERIENCE_SLUGS, ...EMPLOYER_SLUGS, ...POPULATION_SLUGS];

const BATCH_SIZE = 10000;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

// Build a lookup: state name → Set of cities with active jobs
async function getCitiesWithJobs(): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  
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
    if (!result.has(stateKey)) result.set(stateKey, new Set());
    result.get(stateKey)!.add(cityKey);
  }

  return result;
}

// Build city slug → state name lookup from CITIES data
const CITY_STATE_LOOKUP = new Map(
  CITIES.map(c => [c.slug, { name: c.name.toLowerCase(), state: c.state.toLowerCase() }])
);

// Generate only URLs where jobs exist
async function getActiveCategoryCityUrls(): Promise<string[]> {
  const citiesWithJobs = await getCitiesWithJobs();
  const urls: string[] = [];

  for (const category of ALL_CATEGORIES) {
    for (const city of CITIES) {
      const stateKey = city.state.toLowerCase().trim();
      const cityKey = city.name.toLowerCase().trim();
      const stateCities = citiesWithJobs.get(stateKey);
      if (stateCities && stateCities.has(cityKey)) {
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
