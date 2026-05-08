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
// Mirrors the constant in /api/sitemaps/jobs/[batch]/route.ts — must stay
// in lockstep so the index reports the right batch count.
const JOB_BATCH_SIZE = 25000;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

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

    // GSC Fix (P1.1): also count populated setting×state URLs that the batch
    // route now emits. Without this the index's batch count under-reports
    // and batch slicing could truncate the tail.
    const settingStateCount = await prisma.pseoStats.count({
      where: { type: 'setting-state', totalJobs: { gte: 1 } },
    });
    totalUrls += settingStateCount;
  } catch {
    // Fallback: estimate conservatively
    totalUrls = SITEMAP_CATEGORIES.length * Math.min(CITIES.length, 500);
  }

  const totalBatches = Math.max(1, Math.ceil(totalUrls / BATCH_SIZE));

  // GSC Fix (P3.8): jobs-batch count. Splitting job-detail URLs into
  // /api/sitemaps/jobs/{N} keeps each file under the 50K-URL cap so the
  // sitemap is never rejected wholesale once ingestion volume scales.
  let activeJobCount = 0;
  try {
    activeJobCount = await prisma.job.count({
      where: {
        isPublished: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
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
