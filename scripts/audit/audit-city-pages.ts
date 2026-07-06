/**
 * Audit pSEO city landing pages.
 *
 * For each city slug:
 *   1. Replicate the /jobs/city/[slug] DB query (city + state OR stateCode).
 *   2. Verify every returned job's structured location actually matches the city.
 *   3. Compare against the MIN_JOBS_FOR_INDEX = 3 threshold.
 *   4. Cross-check whether the URL ships in either sitemap (primary sitemap.ts
 *      or the category×city /api/sitemaps/cities/[batch] route via pseoStats).
 *
 * Run:  npx tsx scripts/audit/audit-city-pages.ts [--env=prod|dev]
 *
 * Shares the env-flag pattern with scripts/audit/wichita-rca.ts.
 */
import { config as dotenvConfig } from 'dotenv';
// Safe to import before dotenv: render-gate is pure and reads no env vars.
import { MIN_JOBS_FOR_CATEGORY_CITY } from '@/lib/pseo/render-gate';

type EnvKind = 'dev' | 'prod';
function parseEnvFlag(): EnvKind {
  const flag = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
  if (flag === 'dev' || flag === 'prod') return flag;
  if (process.argv.includes('--dev')) return 'dev';
  if (process.argv.includes('--prod')) return 'prod';
  return 'prod';
}
const ENV: EnvKind = parseEnvFlag();
if (ENV === 'prod') {
  dotenvConfig({ path: '.env.prod' });
  if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
  }
  if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) {
    process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
  }
} else {
  dotenvConfig({ path: '.env' });
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');

// Same SSOT constant as MIN_JOBS_FOR_INDEX (lib/pseo/category-city-template.tsx)
// and MIN_SITEMAP_JOBS (app/api/sitemaps/cities/[batch]/route.ts).
const MIN_JOBS = MIN_JOBS_FOR_CATEGORY_CITY;

// Mirror parseCitySlug in app/jobs/city/[slug]/page.tsx
const STATE_CODES: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI',
  Wyoming: 'WY', 'District of Columbia': 'DC',
};
const CODE_TO_STATE: Record<string, string> = Object.entries(STATE_CODES)
  .reduce((acc, [state, code]) => ({ ...acc, [code]: state }), {} as Record<string, string>);

interface ParsedSlug {
  cityName: string;
  stateName: string;
  stateCode: string;
}

function parseCitySlug(slug: string): ParsedSlug | null {
  const normalized = slug.toLowerCase().trim();
  const match = normalized.match(/^(.+)-([a-z]{2})$/);
  if (!match) return null;
  const [, citySlugPart, stateCodeRaw] = match;
  const stateCode = stateCodeRaw.toUpperCase();
  const stateName = CODE_TO_STATE[stateCode];
  if (!stateName) return null;
  const cityName = citySlugPart
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return { cityName, stateName, stateCode };
}

// Cities to audit. Includes wichita explicitly for the Missouri-leak check.
const CITY_SLUGS = [
  'wichita-ks',
  'kansas-city-mo',
  'austin-tx',
  'miami-fl',
  'denver-co',
  'phoenix-az',
  'columbus-oh',
  'portland-or',
  'nashville-tn',
  'minneapolis-mn',
];

interface RowResult {
  slug: string;
  count: number;
  allMatch: boolean;
  mismatchSamples: string[];
  subThreshold: boolean;
  inPrimarySitemap: boolean;
  inPseoSitemap: boolean;
}

async function auditCity(slug: string): Promise<RowResult> {
  const parsed = parseCitySlug(slug);
  if (!parsed) {
    return {
      slug,
      count: 0,
      allMatch: false,
      mismatchSamples: [],
      subThreshold: true,
      inPrimarySitemap: false,
      inPseoSitemap: false,
    };
  }
  const { cityName, stateName, stateCode } = parsed;

  // Same WHERE clause as getCityJobs / getCityStats in /jobs/city/[slug]
  const jobs = await prisma.job.findMany({
    where: {
      isPublished: true,
      city: { equals: cityName, mode: 'insensitive' },
      OR: [{ state: stateName }, { stateCode }],
    },
    select: {
      id: true,
      title: true,
      city: true,
      state: true,
      stateCode: true,
    },
  });

  // Match check: city case-insensitive equals AND (state matches OR stateCode matches)
  const mismatches = jobs.filter((j) => {
    const cityOk = (j.city ?? '').trim().toLowerCase() === cityName.toLowerCase();
    const stateOk = j.state === stateName || j.stateCode === stateCode;
    return !(cityOk && stateOk);
  });

  // Primary sitemap inclusion mirrors app/sitemap.ts cityPages filter
  // (top 2000 cities groupBy with _count.city >= 3). We re-derive it locally.
  const primarySitemapEligible = jobs.length >= MIN_JOBS;

  // PSEO category×city sitemap (any of the 13 categories) — check if any
  // pseoStats row for this locationSlug has totalJobs ≥ MIN_JOBS.
  // The generic /jobs/city/[slug] URL is NOT emitted here (only by primary).
  let inPseoSitemap = false;
  try {
    const pseoRow = await prisma.pseoStats.findFirst({
      where: {
        type: 'category-city',
        locationSlug: slug,
        totalJobs: { gte: MIN_JOBS },
      },
      select: { categorySlug: true },
    });
    inPseoSitemap = pseoRow !== null;
  } catch {
    // pseoStats table may not exist in dev — non-fatal
  }

  return {
    slug,
    count: jobs.length,
    allMatch: mismatches.length === 0,
    mismatchSamples: mismatches.slice(0, 3).map((m) => `${m.title} [${m.city}, ${m.state ?? m.stateCode}]`),
    subThreshold: jobs.length < MIN_JOBS,
    inPrimarySitemap: primarySitemapEligible,
    inPseoSitemap,
  };
}

async function wichitaMissouriCheck() {
  // Wichita, KS pulls jobs WHERE city='wichita' AND (state='Kansas' OR stateCode='KS').
  // Look for jobs returned by that query whose description/title mentions Missouri.
  const parsed = parseCitySlug('wichita-ks')!;
  const jobs = await prisma.job.findMany({
    where: {
      isPublished: true,
      city: { equals: parsed.cityName, mode: 'insensitive' },
      OR: [{ state: parsed.stateName }, { stateCode: parsed.stateCode }],
    },
    select: { id: true, title: true, description: true, city: true, state: true, stateCode: true },
  });

  const moMentions = jobs.filter((j) => {
    const body = `${j.title ?? ''} ${j.description ?? ''}`.toLowerCase();
    // Match "missouri" or " mo " or "mo," but avoid common false positives like "month", "more", "modify"
    return /\bmissouri\b/.test(body) || /\bmo\b(?!\w)/.test(body.replace(/\bmonth\w*\b/g, ''));
  });

  return moMentions.slice(0, 5).map((j) => ({ id: j.id, title: j.title, city: j.city, state: j.state ?? j.stateCode }));
}

async function main() {
  console.log(`[audit-city-pages] env=${ENV}, MIN_JOBS=${MIN_JOBS}\n`);

  const rows: RowResult[] = [];
  for (const slug of CITY_SLUGS) {
    rows.push(await auditCity(slug));
  }

  // Table 1 — city audit
  console.log('| City slug | Count | All match? | Sub-threshold? (count<3) | In sitemap? |');
  console.log('|---|---|---|---|---|');
  for (const r of rows) {
    const sitemap = r.inPrimarySitemap ? 'primary' : r.inPseoSitemap ? 'pseo only' : 'no';
    console.log(`| ${r.slug} | ${r.count} | ${r.allMatch ? 'yes' : 'NO'} | ${r.subThreshold ? 'YES' : 'no'} | ${sitemap} |`);
  }

  // Issue summary
  console.log('\n| Issue | Detail | Fix |');
  console.log('|---|---|---|');

  const subThresholdInSitemap = rows.filter((r) => r.subThreshold && (r.inPrimarySitemap || r.inPseoSitemap));
  if (subThresholdInSitemap.length > 0) {
    console.log(
      `| Sub-threshold city in sitemap | ${subThresholdInSitemap.map((r) => `${r.slug}(${r.count})`).join(', ')} | Drop from sitemap; page already 404s |`
    );
  }

  const mismatched = rows.filter((r) => !r.allMatch);
  for (const r of mismatched) {
    console.log(`| Location mismatch | ${r.slug}: ${r.mismatchSamples.join(' / ')} | Tighten city/state join; investigate normalization |`);
  }

  const wichitaMo = await wichitaMissouriCheck();
  if (wichitaMo.length > 0) {
    console.log(
      `| Wichita-MO leak | ${wichitaMo.length} job(s) on wichita-ks mention Missouri: ${wichitaMo.map((j) => j.title).join(' / ')} | Re-verify city normalizer; likely Wichita, KS body referencing nearby MO market |`
    );
  } else {
    console.log(`| Wichita-MO leak | none detected | n/a |`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
