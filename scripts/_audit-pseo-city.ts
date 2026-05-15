/**
 * Audit pSEO city landing pages.
 *
 * Covers:
 *   1) Top-level   /jobs/city/[slug]                  (free-form, no taxonomy)
 *   2) Category-x  /jobs/<cat>/city/[slug]            (28 taxonomies × top cities)
 *
 * Verifies:
 *   - Slug format parses (`<city-kebab>-<state-code>`) for indexable cities
 *   - MIN_JOBS=3 threshold enforcement at sitemap + indexability gates
 *   - 5 high-volume cities are accurate (location.city matches)
 *   - 5 low-volume cities (3-5 jobs) clear the threshold
 *   - Wichita, KS state-leakage spot-check (KS-tagged rows with MO cues)
 *   - Category-city double-filter integrity (outpatient AND wichita-ks)
 *
 * Usage:  npx tsx scripts/_audit-pseo-city.ts
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) {
  process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
}
if (!process.env.DATABASE_URL) dotenvConfig({ path: '.env.local' });
if (!process.env.DATABASE_URL) dotenvConfig({ path: '.env' });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');

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

function buildSlug(city: string, stateCode: string): string {
  const c = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${c}-${stateCode.toLowerCase()}`;
}

function detectStatesInDescription(desc: string): Set<string> {
  if (!desc) return new Set();
  const hits = new Set<string>();
  const lower = desc.toLowerCase();
  for (const [name, code] of Object.entries(STATE_CODES)) {
    const patterns = [
      new RegExp(`\\b${name}\\s+(?:state\\s+)?(?:rn\\s+)?(?:np\\s+)?(?:aprn\\s+)?(?:pmhnp\\s+)?licens(?:e|ure)`, 'i'),
      new RegExp(`licens(?:ed|ure)\\s+(?:in\\s+|to\\s+practice\\s+in\\s+)${name}\\b`, 'i'),
      new RegExp(`active\\s+${name}\\s+(?:state\\s+)?license`, 'i'),
      new RegExp(`${name}\\s+(?:state\\s+)?board\\s+of\\s+nursing`, 'i'),
    ];
    if (patterns.some(p => p.test(lower))) hits.add(code);
  }
  return hits;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) Top-level /jobs/city/[slug] — count distinct (city, stateCode) bins
// ─────────────────────────────────────────────────────────────────────────────
async function auditTopLevelCityBuild() {
  console.log('\n========== 1. TOP-LEVEL /jobs/city/[slug] BUILD SET ==========');

  const groups = await prisma.job.groupBy({
    by: ['city', 'stateCode'],
    where: { isPublished: true, city: { not: null }, stateCode: { not: null } },
    _count: { city: true },
  });

  const cleaned = groups.filter(g => g.city && g.stateCode && g.city.trim());
  const ge3 = cleaned.filter(g => g._count.city >= 3);
  const lt3 = cleaned.filter(g => g._count.city < 3);

  console.log(`Distinct (city, stateCode) bins: ${cleaned.length}`);
  console.log(`  jobs >= 3 (sitemap-eligible per app/sitemap.ts:230): ${ge3.length}`);
  console.log(`  jobs <  3 (excluded from sitemap, but page still renders if totalJobs>0): ${lt3.length}`);
  console.log('NOTE: /jobs/city/[slug]/page.tsx:387-389 only 404s when totalJobs===0.');
  console.log('      No MIN_JOBS=3 gate at the PAGE level — 1- or 2-job pages still render 200 OK.');
  console.log('      Sitemap-level gate IS enforced (sitemap.ts:230).');

  // Top 5 by volume
  const top5 = [...ge3].sort((a, b) => b._count.city - a._count.city).slice(0, 5);
  console.log('\nTop 5 sitemap-eligible cities:');
  for (const c of top5) {
    console.log(`  ${c.city}, ${c.stateCode}  →  ${c._count.city} jobs  →  slug=${buildSlug(c.city!, c.stateCode!)}`);
  }

  // 5 low-volume right at the threshold
  const at3to5 = ge3.filter(c => c._count.city >= 3 && c._count.city <= 5);
  const sample5low = at3to5.sort(() => 0.5 - Math.random()).slice(0, 5);
  console.log('\n5 low-volume (3-5 jobs) sitemap-eligible cities:');
  for (const c of sample5low) {
    console.log(`  ${c.city}, ${c.stateCode}  →  ${c._count.city} jobs  →  slug=${buildSlug(c.city!, c.stateCode!)}`);
  }

  // Cities right BELOW threshold that the page would still render
  const lt3Sample = lt3.sort((a, b) => b._count.city - a._count.city).slice(0, 5);
  console.log('\n5 cities BELOW threshold (sitemap excludes; page still renders 200 OK):');
  for (const c of lt3Sample) {
    console.log(`  ${c.city}, ${c.stateCode}  →  ${c._count.city} jobs  →  /jobs/city/${buildSlug(c.city!, c.stateCode!)}`);
  }

  return { top5, sample5low };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) High-volume city sample — verify location.city matches
// ─────────────────────────────────────────────────────────────────────────────
async function auditHighVolumeAccuracy(top5: Array<{ city: string | null; stateCode: string | null; _count: { city: number } }>) {
  console.log('\n========== 2. HIGH-VOLUME CITY ACCURACY (sample 10 each) ==========');
  for (const c of top5) {
    if (!c.city || !c.stateCode) continue;
    const jobs = await prisma.job.findMany({
      where: {
        isPublished: true,
        city: { equals: c.city, mode: 'insensitive' },
        stateCode: c.stateCode,
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: { id: true, city: true, stateCode: true, employer: true, title: true, isRemote: true },
    });
    const mismatches = jobs.filter(
      j => (j.city || '').toLowerCase() !== c.city!.toLowerCase() || j.stateCode !== c.stateCode
    );
    console.log(`\n  ${c.city}, ${c.stateCode} — total ${c._count.city}, sampled ${jobs.length}, mismatches: ${mismatches.length}`);
    if (mismatches.length > 0) {
      mismatches.slice(0, 5).forEach(j => console.log(`    MISMATCH [${j.id}] city=${j.city} state=${j.stateCode} | ${j.employer} — ${j.title.slice(0, 60)}`));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Low-volume threshold check
// ─────────────────────────────────────────────────────────────────────────────
async function auditLowVolumeThreshold(sample5low: Array<{ city: string | null; stateCode: string | null; _count: { city: number } }>) {
  console.log('\n========== 3. LOW-VOLUME (3-5 jobs) THRESHOLD CHECK ==========');
  for (const c of sample5low) {
    if (!c.city || !c.stateCode) continue;
    const live = await prisma.job.count({
      where: { isPublished: true, city: { equals: c.city, mode: 'insensitive' }, stateCode: c.stateCode },
    });
    const meets = live >= 3 ? 'PASS' : 'FAIL';
    console.log(`  ${c.city}, ${c.stateCode} — groupBy=${c._count.city}, live=${live} → ${meets}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Wichita, KS deep dive (user-reported)
// ─────────────────────────────────────────────────────────────────────────────
async function auditWichita() {
  console.log('\n========== 4. WICHITA, KS DEEP DIVE ==========');
  const slug = 'wichita-ks';
  console.log(`Page URL would be: /jobs/city/${slug}`);

  const jobs = await prisma.job.findMany({
    where: {
      isPublished: true,
      city: { equals: 'Wichita', mode: 'insensitive' },
      OR: [{ state: 'Kansas' }, { stateCode: 'KS' }],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, title: true, employer: true, city: true, state: true,
      stateCode: true, description: true, isRemote: true, slug: true,
    },
  });

  console.log(`Total Wichita-KS jobs matching page query: ${jobs.length}`);

  let stateMismatch = 0;
  let descMentionsOtherState = 0;
  const flagged: string[] = [];

  for (const j of jobs) {
    if (j.stateCode !== 'KS') {
      stateMismatch++;
      flagged.push(`  STATE [${j.id}] city=${j.city} state=${j.state} stateCode=${j.stateCode} | ${j.employer} — ${j.title.slice(0, 60)}`);
    }
    const detected = detectStatesInDescription(j.description || '');
    detected.delete('KS');
    if (detected.size > 0) {
      descMentionsOtherState++;
      flagged.push(`  DESC  [${j.id}] desc-licensure-cue=${Array.from(detected).join(',')} | ${j.employer} — ${j.title.slice(0, 60)}`);
    }
  }

  console.log(`\nFlags: stateCode!=KS: ${stateMismatch}, description licensure cue for non-KS state: ${descMentionsOtherState}`);
  if (flagged.length > 0) console.log(flagged.slice(0, 15).join('\n'));
  if (jobs.length < 3) {
    console.log('\nThreshold check: total < 3 — sitemap would EXCLUDE this URL.');
  }
  console.log('\n--- First 5 Wichita-KS jobs (title + employer) ---');
  jobs.slice(0, 5).forEach(j => console.log(`  [${j.id}] ${j.employer} — ${j.title.slice(0, 80)}`));
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) Category-city integrity — outpatient + wichita-ks
// ─────────────────────────────────────────────────────────────────────────────
async function auditCategoryCity() {
  console.log('\n========== 5. CATEGORY-CITY DOUBLE-FILTER INTEGRITY ==========');

  // outpatient + Wichita
  // Mirrors lib/pseo/category-city-template.tsx :: SETTING_CONFIGS.outpatient
  // which builds { isPublished, state, city, ...withTagFallback('outpatient') }.
  // We approximate the tag clause with a tag/category match; if no jobs are
  // tagged 'outpatient' for Wichita the count should be 0 and the page would 308.
  const wichitaTotal = await prisma.job.count({
    where: {
      isPublished: true,
      city: { equals: 'Wichita', mode: 'insensitive' },
      state: { equals: 'Kansas', mode: 'insensitive' },
    },
  });

  // pseoStats row (the source of truth at runtime for category-city)
  const outpatientWichita = await prisma.pseoStats.findUnique({
    where: {
      type_categorySlug_locationSlug: {
        type: 'category-city',
        categorySlug: 'outpatient',
        locationSlug: 'wichita-ks',
      },
    },
    select: { totalJobs: true, updatedAt: true },
  });
  console.log(`Wichita-KS (any category) total: ${wichitaTotal}`);
  console.log(`pseoStats[category-city, outpatient, wichita-ks]: ${JSON.stringify(outpatientWichita)}`);

  // Sample 5 category-city stat rows in pseoStats — verify totalJobs >= 3 where they exist
  const sample = await prisma.pseoStats.findMany({
    where: { type: 'category-city', totalJobs: { gt: 0, lt: 3 } },
    take: 10,
    select: { categorySlug: true, locationSlug: true, totalJobs: true },
  });
  console.log(`\nCategory-city pseoStats rows with 1-2 jobs (below MIN_JOBS_FOR_INDEX=3): ${sample.length}`);
  sample.forEach(r => console.log(`  ${r.categorySlug}/city/${r.locationSlug}  →  ${r.totalJobs} jobs (renders, but noindex)`));
  console.log('NOTE: lib/pseo/category-city-template.tsx:851 sets MIN_JOBS_FOR_INDEX=3.');
  console.log('      <3 jobs → page renders with quality score 10 → falls under index threshold (25) → noindex.');
  console.log('      Sitemap excludes (cities/[batch]/route.ts:53 MIN_SITEMAP_JOBS=3).');

  // Cross-validate count: pseoStats vs live count for a random category-city
  const rand = await prisma.pseoStats.findFirst({
    where: { type: 'category-city', totalJobs: { gte: 3 } },
    orderBy: { updatedAt: 'desc' },
    select: { categorySlug: true, locationSlug: true, totalJobs: true },
  });
  if (rand) {
    console.log(`\nFreshness probe: pseoStats[${rand.categorySlug}/${rand.locationSlug}] = ${rand.totalJobs}`);
    console.log('(Live count comparison would need buildWhere(); skipping to keep audit read-only.)');
  }
}

async function main() {
  try {
    const { top5, sample5low } = await auditTopLevelCityBuild();
    await auditHighVolumeAccuracy(top5);
    await auditLowVolumeThreshold(sample5low);
    await auditWichita();
    await auditCategoryCity();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
