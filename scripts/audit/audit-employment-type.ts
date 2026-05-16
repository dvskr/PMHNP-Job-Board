/**
 * Audit: employment-type filter pages.
 *
 * Each /jobs/<slug> page (full-time, part-time, contract, 1099,
 * per-diem, locum-tenens, travel) is composed by
 * `buildCategoryWhereClause(slug)` in `lib/filters.ts`. The Job model
 * exposes a free-text `jobType String?` column (NOT an enum), so the
 * category filters are TITLE-REGEX based, with global PMHNP-only
 * exclusions layered on top.
 *
 * This script:
 *   1. Counts each filter using its real WHERE.
 *   2. Samples 10 jobs/filter and reports title / jobType / source.
 *   3. Validates overlaps that should be disjoint (FULL_TIME ∩ part-time)
 *      and the contract / 1099 / locum-tenens alias question.
 *
 * Read-only. Run against prod:
 *   tsx scripts/audit/audit-employment-type.ts
 */
// Loads .env.local (dev DB) by default. To target prod, run:
//   tsx --env-file=.env.prod scripts/audit/audit-employment-type.ts
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env' });
if (process.env.PROD_DATABASE_URL && process.env.AUDIT_USE_PROD === '1') {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import { buildCategoryWhereClause } from '@/lib/filters';

const SLUGS = [
  'full-time',
  'part-time',
  'contract',
  '1099',
  'per-diem',
  'locum-tenens',
  'travel',
] as const;

type Slug = (typeof SLUGS)[number];

interface SampleRow {
  title: string;
  jobType: string | null;
  sourceProvider: string | null;
  sourceSite: string | null;
}

async function countAndSample(slug: Slug): Promise<{ count: number; samples: SampleRow[] }> {
  const where = buildCategoryWhereClause(slug);
  const [count, samples] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      select: { title: true, jobType: true, sourceProvider: true, sourceSite: true },
      take: 10,
      orderBy: { qualityScore: 'desc' },
    }),
  ]);
  return { count, samples };
}

async function overlapCount(a: Slug, b: Slug): Promise<number> {
  const whereA = buildCategoryWhereClause(a);
  const whereB = buildCategoryWhereClause(b);
  return prisma.job.count({
    where: { AND: [whereA, whereB] },
  });
}

/**
 * Cross-check: jobs whose structured jobType column == "Full-time" / "FULL_TIME"
 * that ALSO match the /jobs/part-time title-regex filter.
 * This is the "should-not-exist" case the audit explicitly calls out.
 */
async function fullTimeStructuredInPartTimeFilter(): Promise<number> {
  const partTimeWhere = buildCategoryWhereClause('part-time');
  return prisma.job.count({
    where: {
      AND: [
        partTimeWhere,
        {
          OR: [
            { jobType: { equals: 'Full-time', mode: 'insensitive' } },
            { jobType: { equals: 'FULL_TIME', mode: 'insensitive' } },
            { jobType: { equals: 'Full Time', mode: 'insensitive' } },
          ],
        },
      ],
    },
  });
}

function printRow(cells: (string | number)[], widths: number[]): void {
  const cols = cells.map((c, i) => String(c).padEnd(widths[i]).slice(0, widths[i]));
  console.log('| ' + cols.join(' | ') + ' |');
}

async function main(): Promise<void> {
  console.log('═'.repeat(80));
  console.log('EMPLOYMENT-TYPE FILTER AUDIT');
  console.log('═'.repeat(80));
  console.log(`Filter source: title regex via buildCategoryWhereClause()`);
  console.log(`Job.jobType column is free-text String? — NOT used by these pages.`);
  console.log();

  // --- Table 1: per-filter counts + 1 sample row ---
  console.log('TABLE 1 — Filter counts & sample');
  console.log('| Filter        | Count  | WHERE source | Sample title                              | Sample jobType |');
  console.log('|---------------|--------|--------------|-------------------------------------------|----------------|');

  const results = new Map<Slug, { count: number; samples: SampleRow[] }>();
  for (const slug of SLUGS) {
    const r = await countAndSample(slug);
    results.set(slug, r);
    const first = r.samples[0];
    const title = (first?.title ?? '(no jobs)').slice(0, 41);
    const jt = first?.jobType ?? '(null)';
    console.log(
      `| ${slug.padEnd(13)} | ${String(r.count).padEnd(6)} | title regex  | ${title.padEnd(41)} | ${jt.padEnd(14)} |`,
    );
  }

  // --- Detailed sample dump ---
  console.log();
  console.log('TABLE 1b — Sample dump (10 jobs per filter)');
  for (const slug of SLUGS) {
    const r = results.get(slug)!;
    console.log(`\n[${slug}] count=${r.count}`);
    for (const s of r.samples) {
      console.log(
        `  • ${(s.title ?? '').slice(0, 60).padEnd(62)} jobType=${(s.jobType ?? 'null').padEnd(14)} src=${s.sourceProvider ?? '-'}/${s.sourceSite ?? '-'}`,
      );
    }
  }

  // --- Table 2: overlaps ---
  console.log();
  console.log('TABLE 2 — Overlaps');
  console.log('| Overlap check                              | A           | B           | Overlap |');
  console.log('|--------------------------------------------|-------------|-------------|---------|');

  const ftPtTitle = await overlapCount('full-time', 'part-time');
  const ftStrInPt = await fullTimeStructuredInPartTimeFilter();
  const ctVs1099 = await overlapCount('contract', '1099');
  const ctVsLocum = await overlapCount('contract', 'locum-tenens');
  const locumVs1099 = await overlapCount('locum-tenens', '1099');
  const locumVsTravel = await overlapCount('locum-tenens', 'travel');
  const ctVsTravel = await overlapCount('contract', 'travel');
  const ptVsPerDiem = await overlapCount('part-time', 'per-diem');

  printRow(
    ['/jobs/full-time ∩ /jobs/part-time (title regex)', 'full-time', 'part-time', ftPtTitle],
    [42, 11, 11, 7],
  );
  printRow(
    ['structured jobType=Full-time AND in /jobs/part-time', 'jobType=FT', 'part-time', ftStrInPt],
    [42, 11, 11, 7],
  );
  printRow(['contract ∩ 1099', 'contract', '1099', ctVs1099], [42, 11, 11, 7]);
  printRow(['contract ∩ locum-tenens', 'contract', 'locum-tenens', ctVsLocum], [42, 11, 11, 7]);
  printRow(['locum-tenens ∩ 1099', 'locum-tenens', '1099', locumVs1099], [42, 11, 11, 7]);
  printRow(['locum-tenens ∩ travel', 'locum-tenens', 'travel', locumVsTravel], [42, 11, 11, 7]);
  printRow(['contract ∩ travel', 'contract', 'travel', ctVsTravel], [42, 11, 11, 7]);
  printRow(['part-time ∩ per-diem', 'part-time', 'per-diem', ptVsPerDiem], [42, 11, 11, 7]);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
