/**
 * Batched city sitemap — serves category × city URLs in batches of 10,000.
 * 
 * Routes:
 *   /api/sitemaps/cities/0 → first 10K URLs
 *   /api/sitemaps/cities/1 → next 10K URLs
 *   /api/sitemaps/cities/2 → next 10K URLs
 *   etc.
 * 
 * Total: 13 categories × 4,135 cities = 53,755 URLs across 6 batches
 */
import { NextResponse } from 'next/server';
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

// Pre-compute all category×city combinations
function getAllCategoryCityUrls(): string[] {
  const urls: string[] = [];
  for (const category of ALL_CATEGORIES) {
    for (const city of CITIES) {
      urls.push(`${BASE_URL}/jobs/${category}/city/${city.slug}`);
    }
  }
  return urls;
}

const ALL_URLS = getAllCategoryCityUrls();

export const TOTAL_BATCHES = Math.ceil(ALL_URLS.length / BATCH_SIZE);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batch: string }> }
) {
  const { batch: batchStr } = await params;
  const batchIndex = parseInt(batchStr, 10);

  if (isNaN(batchIndex) || batchIndex < 0 || batchIndex >= TOTAL_BATCHES) {
    return NextResponse.json({ error: 'Invalid batch index' }, { status: 404 });
  }

  const start = batchIndex * BATCH_SIZE;
  const end = Math.min(start + BATCH_SIZE, ALL_URLS.length);
  const batchUrls = ALL_URLS.slice(start, end);

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
