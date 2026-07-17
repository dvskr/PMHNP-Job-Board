/**
 * One-off audit: cross-check the GSC "Crawled - currently not indexed" sample
 * (2026-07-12 export) against current DB state.
 *
 *   1. job-detail URLs  -> does the Job row still exist? published? expired? dead-link?
 *   2. category-city    -> pseoStats.totalJobs now vs MIN_JOBS_FOR_CATEGORY_CITY
 *   3. city pages       -> active job count per city vs MIN_JOBS gate
 *
 * Run:  npx tsx scripts/audit/audit-gsc-cni-sample.ts --env=prod
 */
import { config as dotenvConfig } from 'dotenv';
import * as fs from 'fs';
import { MIN_JOBS_FOR_CATEGORY_CITY } from '@/lib/pseo/render-gate';
import { activeIndexableJobWhere } from '@/lib/active-job-filter';

type EnvKind = 'dev' | 'prod';
function parseEnvFlag(): EnvKind {
  const flag = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
  if (flag === 'dev' || flag === 'prod') return flag;
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

const CSV_PATH =
  'C:/Users/SATHIS~1.KUM/DOWNLO~1/CURSOR~1.EXE/claude/c--Users-sathish-kumar-PMHNP-Job-Board/ccee337f-519f-4cc1-844c-dca5e01d2f0f/scratchpad/gsc_csv/Coverage-Drilldown_(6)__Table.csv';

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

async function main() {
  const lines = fs.readFileSync(CSV_PATH, 'utf-8').split('\n').slice(1).filter(Boolean);
  const urls = lines.map((l) => l.split(',')[0].trim());

  const jobIds: string[] = [];
  const catCity: { cat: string; city: string }[] = [];
  const citySlugs: string[] = [];

  for (const u of urls) {
    const path = new URL(u).pathname;
    if (path.startsWith('/_next/')) continue;
    const m = path.match(UUID_RE);
    if (m && path.startsWith('/jobs/')) {
      jobIds.push(m[1]);
      continue;
    }
    const cc = path.match(/^\/jobs\/([^/]+)\/city\/([^/]+)$/);
    if (cc) {
      catCity.push({ cat: cc[1], city: cc[2] });
      continue;
    }
    const c = path.match(/^\/jobs\/city\/([^/]+)$/);
    if (c) citySlugs.push(c[1]);
  }

  console.log(`parsed: ${jobIds.length} job ids, ${catCity.length} cat-city, ${citySlugs.length} city`);

  // ── 1. job-detail state ──────────────────────────────────────────
  const now = new Date();
  const jobs = await prisma.job.findMany({
    where: { id: { in: jobIds } },
    select: {
      id: true,
      isPublished: true,
      expiresAt: true,
      healthConsecutiveMissing: true,
      createdAt: true,
      originalPostedAt: true,
    },
  });
  const byId = new Map(jobs.map((j) => [j.id, j]));
  let deleted = 0,
    unpublished = 0,
    expired = 0,
    deadlink = 0,
    activeIndexable = 0;
  for (const id of jobIds) {
    const j = byId.get(id);
    if (!j) {
      deleted++;
      continue;
    }
    if (!j.isPublished) {
      unpublished++;
      continue;
    }
    if (j.expiresAt && j.expiresAt <= now) {
      expired++;
      continue;
    }
    if (j.healthConsecutiveMissing >= 5) {
      deadlink++;
      continue;
    }
    activeIndexable++;
  }
  console.log('\njob-detail sample state (n=' + jobIds.length + '):');
  console.log('  deleted from DB        :', deleted);
  console.log('  unpublished            :', unpublished);
  console.log('  expired                :', expired);
  console.log('  dead-link gated        :', deadlink);
  console.log('  ACTIVE + indexable     :', activeIndexable);

  // age of still-active ones
  const activeJobs = jobs.filter(
    (j) =>
      j.isPublished &&
      (!j.expiresAt || j.expiresAt > now) &&
      j.healthConsecutiveMissing < 5,
  );
  const ages = activeJobs
    .map((j) => (now.getTime() - j.createdAt.getTime()) / 86400000)
    .sort((a, b) => a - b);
  if (ages.length) {
    console.log(
      '  active job age (days) min/median/max:',
      ages[0].toFixed(0),
      ages[Math.floor(ages.length / 2)].toFixed(0),
      ages[ages.length - 1].toFixed(0),
    );
  }

  // ── 2. category-city gate state ──────────────────────────────────
  const ccResults = { aboveGate: 0, belowGate: 0, noRow: 0 };
  const staleThreshold = new Date(Date.now() - 36 * 3600 * 1000);
  let ccStale = 0;
  for (const { cat, city } of catCity) {
    const row = await prisma.pseoStats.findFirst({
      where: { type: 'category-city', categorySlug: cat, locationSlug: city },
      select: { totalJobs: true, updatedAt: true },
    });
    if (!row) {
      ccResults.noRow++;
      continue;
    }
    if (row.updatedAt < staleThreshold) ccStale++;
    if (row.totalJobs >= MIN_JOBS_FOR_CATEGORY_CITY) ccResults.aboveGate++;
    else ccResults.belowGate++;
  }
  console.log('\ncategory-city sample vs MIN_JOBS=' + MIN_JOBS_FOR_CATEGORY_CITY + ' (n=' + catCity.length + '):');
  console.log('  currently >= gate (in sitemap, indexable):', ccResults.aboveGate);
  console.log('  currently <  gate (404s now)             :', ccResults.belowGate);
  console.log('  no pseoStats row (404s now)              :', ccResults.noRow);
  console.log('  stale pseoStats rows (>36h)              :', ccStale);

  // ── 3. city page gate state ──────────────────────────────────────
  const ACTIVE = activeIndexableJobWhere(now);
  let cityAbove = 0,
    cityBelow = 0;
  for (const slug of citySlugs) {
    // slug = city-name-xx (state code suffix)
    const m = slug.match(/^(.*)-([a-z]{2})$/);
    if (!m) {
      cityBelow++;
      continue;
    }
    const cityName = m[1].replace(/-/g, ' ');
    const code = m[2].toUpperCase();
    const count = await prisma.job.count({
      where: {
        ...ACTIVE,
        city: { equals: cityName, mode: 'insensitive' },
        OR: undefined,
        AND: [
          { OR: (ACTIVE as { OR: object[] }).OR },
          { OR: [{ state: { equals: code, mode: 'insensitive' } }] },
        ],
      },
    });
    if (count >= MIN_JOBS_FOR_CATEGORY_CITY) cityAbove++;
    else cityBelow++;
    console.log(`  city ${slug}: ${count} active jobs`);
  }
  console.log('\ncity sample vs MIN_JOBS gate (n=' + citySlugs.length + '):');
  console.log('  >= 3 active jobs:', cityAbove);
  console.log('  <  3 active jobs:', cityBelow);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
