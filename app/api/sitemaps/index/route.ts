/**
 * Sitemap Index — lists the primary sitemap and all city sitemap batches.
 * 
 * Google crawls this first, then follows links to individual sitemaps.
 * Route: /api/sitemaps/index
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
const TOTAL_URLS = ALL_CATEGORIES.length * CITIES.length;
const TOTAL_BATCHES = Math.ceil(TOTAL_URLS / BATCH_SIZE);

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

export async function GET() {
  const lastmod = new Date().toISOString().split('T')[0];

  // Build sitemap entries: 1 primary + N city batches
  const sitemaps = [
    `  <sitemap>
    <loc>${BASE_URL}/sitemap.xml</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>`,
  ];

  for (let i = 0; i < TOTAL_BATCHES; i++) {
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
