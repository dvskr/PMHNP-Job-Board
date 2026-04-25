/**
 * Sitemap Index — lists the primary sitemap and all city sitemap batches.
 * 
 * DB-driven: batch count is now calculated from actual job data
 * instead of static category×city count.
 * 
 * Route: /api/sitemaps/index
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CITIES } from '@/lib/pseo/city-data/cities';

// Must match SITEMAP_CATEGORIES in cities/[batch]/route.ts
const SITEMAP_CATEGORIES = [
  'remote', 'telehealth', 'inpatient', 'outpatient', 'travel',
  'full-time', 'part-time', 'contract',
  'addiction', 'new-grad', '1099', 'behavioral-health', 'correctional',
];

const BATCH_SIZE = 10000;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

export async function GET() {
  const lastmod = new Date().toISOString().split('T')[0];

  // DB-driven: count how many category×city URLs meet quality thresholds
  // Must match the pruning logic in cities/[batch]/route.ts
  const MIN_SITEMAP_JOBS = 3;
  const MIN_SITEMAP_POPULATION = 10000;
  let totalUrls = 0;
  try {
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

    // Build city→count lookup
    const cityJobCounts = new Map(
      citiesWithJobs
        .filter(r => r.city && r.state)
        .map(r => [`${r.city!.toLowerCase().trim()}|${r.state!.toLowerCase().trim()}`, r._count.city])
    );

    // Count matching category×city URLs that pass quality gates
    for (const _category of SITEMAP_CATEGORIES) {
      for (const city of CITIES) {
        if (city.population < MIN_SITEMAP_POPULATION) continue;
        const key = `${city.name.toLowerCase().trim()}|${city.state.toLowerCase().trim()}`;
        const jobCount = cityJobCounts.get(key) || 0;
        if (jobCount >= MIN_SITEMAP_JOBS) totalUrls++;
      }
    }
  } catch {
    // Fallback: estimate conservatively
    totalUrls = SITEMAP_CATEGORIES.length * Math.min(CITIES.length, 500);
  }

  const totalBatches = Math.max(1, Math.ceil(totalUrls / BATCH_SIZE));

  // Build sitemap entries: 1 primary + N city batches
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
