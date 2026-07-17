/**
 * READ-ONLY audit: cross-check the GSC duplicate-canonical samples
 * (2026-07-12 export) against current DB state.
 *
 *   Drilldown (4) = "Duplicate without user-selected canonical"  (2,016 pages)
 *   Drilldown (7) = "Duplicate, Google chose different canonical" (338 pages)
 *
 * For each job-detail URL:
 *   1. DB state: deleted / unpublished / active
 *   2. slug form: crawled URL slug === stored Job.slug? (variant vs canonical)
 *   3. For ACTIVE jobs: identity-cluster analysis — do 2+ active jobs in the
 *      sample share normalized title+employer+location (true dedup miss),
 *      title+employer only (multi-location same-JD), or title only?
 *
 * Run:  npx tsx scripts/audit/audit-gsc-dup-canonical-sample.ts --env=prod
 */
import { config as dotenvConfig } from 'dotenv';
import * as fs from 'fs';

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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { normalizeTitle, normalizeCompany, normalizeLocation } =
  require('@/lib/deduplicator') as typeof import('@/lib/deduplicator');

const DIR =
  'C:/Users/SATHIS~1.KUM/DOWNLO~1/CURSOR~1.EXE/claude/c--Users-sathish-kumar-PMHNP-Job-Board/ccee337f-519f-4cc1-844c-dca5e01d2f0f/scratchpad/gsc_csv';
const SAMPLES: Record<string, string> = {
  'dup-no-canonical(4)': `${DIR}/Coverage-Drilldown_(4)__Table.csv`,
  'google-overrode(7)': `${DIR}/Coverage-Drilldown_(7)__Table.csv`,
};

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

async function analyzeSample(label: string, csvPath: string) {
  const lines = fs.readFileSync(csvPath, 'utf-8').split('\n').slice(1).filter(Boolean);
  const entries = lines
    .map((l) => {
      const [url, crawled] = l.split(',');
      return { url: url.trim(), crawled: (crawled || '').trim() };
    })
    .filter((e) => e.url.startsWith('http'));

  const jobEntries: { id: string; urlSlug: string; crawled: string }[] = [];
  for (const e of entries) {
    const path = new URL(e.url).pathname;
    const m = path.match(UUID_RE);
    if (m && /^\/jobs\/[^/]+$/.test(path)) {
      jobEntries.push({ id: m[1], urlSlug: path.replace('/jobs/', ''), crawled: e.crawled });
    }
  }

  const jobs = await prisma.job.findMany({
    where: { id: { in: jobEntries.map((j) => j.id) } },
    select: {
      id: true, slug: true, title: true, employer: true, location: true,
      city: true, state: true, isPublished: true, expiresAt: true,
      sourceProvider: true, createdAt: true,
    },
  });
  const byId = new Map(jobs.map((j) => [j.id, j]));

  const now = new Date();
  let deleted = 0, unpublished = 0, expired = 0, active = 0;
  let slugMatch = 0, slugVariant = 0, slugNull = 0;
  const activeJobs: typeof jobs = [];

  for (const je of jobEntries) {
    const j = byId.get(je.id);
    if (!j) { deleted++; continue; }
    if (!j.isPublished) { unpublished++; }
    else if (j.expiresAt && j.expiresAt <= now) { expired++; }
    else { active++; activeJobs.push(j); }

    if (j.slug == null) slugNull++;
    else if (j.slug === je.urlSlug) slugMatch++;
    else slugVariant++;
  }

  console.log(`\n===== ${label} — n=${jobEntries.length} job-detail URLs =====`);
  console.log(`  deleted from DB   : ${deleted}`);
  console.log(`  unpublished       : ${unpublished}`);
  console.log(`  expired (date)    : ${expired}`);
  console.log(`  ACTIVE            : ${active}`);
  console.log(`  -- of rows still in DB (${jobEntries.length - deleted}):`);
  console.log(`  crawled URL === stored slug : ${slugMatch}`);
  console.log(`  crawled URL is a VARIANT    : ${slugVariant}`);
  console.log(`  stored slug NULL            : ${slugNull}`);

  // Identity clustering among ACTIVE jobs in this sample
  const full = new Map<string, string[]>();   // title|employer|location
  const teKey = new Map<string, string[]>();  // title|employer
  const tKey = new Map<string, string[]>();   // title only
  for (const j of activeJobs) {
    const t = normalizeTitle(j.title);
    const k3 = `${t}|${normalizeCompany(j.employer)}|${normalizeLocation(j.location)}`;
    const k2 = `${t}|${normalizeCompany(j.employer)}`;
    for (const [map, k] of [[full, k3], [teKey, k2], [tKey, t]] as const) {
      const arr = map.get(k) || [];
      arr.push(j.id);
      map.set(k, arr);
    }
  }
  const clustersOf = (m: Map<string, string[]>) =>
    [...m.entries()].filter(([, v]) => v.length > 1);
  const fullDups = clustersOf(full);
  const teDups = clustersOf(teKey);
  const tDups = clustersOf(tKey);
  console.log(`  -- among ${activeJobs.length} ACTIVE jobs in sample:`);
  console.log(`  exact title+employer+location clusters (TRUE dedup misses): ${fullDups.length} clusters, ${fullDups.reduce((s, [, v]) => s + v.length, 0)} jobs`);
  console.log(`  title+employer clusters (multi-location same JD)          : ${teDups.length} clusters, ${teDups.reduce((s, [, v]) => s + v.length, 0)} jobs`);
  console.log(`  title-only clusters                                       : ${tDups.length} clusters, ${tDups.reduce((s, [, v]) => s + v.length, 0)} jobs`);
  if (fullDups.length) {
    console.log('  TRUE-dup clusters (title|employer|location -> ids):');
    for (const [k, v] of fullDups.slice(0, 10)) console.log(`    [${v.length}] ${k.slice(0, 90)} -> ${v.join(', ')}`);
  }
  // biggest title+employer clusters
  const teTop = teDups.sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  if (teTop.length) {
    console.log('  top title+employer clusters:');
    for (const [k, v] of teTop) console.log(`    [${v.length}] ${k.slice(0, 90)}`);
  }
}

async function main() {
  for (const [label, csvPath] of Object.entries(SAMPLES)) {
    await analyzeSample(label, csvPath);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
