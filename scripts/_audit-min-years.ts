/**
 * Audit the `minYearsExperience` filter.
 *
 * Verifies "candidate-qualifies semantics": for YOE = N, a job matches if
 *   minYearsExperience <= N  OR  minYearsExperience IS NULL.
 *
 * Reports:
 *   - Counts per YOE bucket (0, 1, 3, 5, 10) against the published-job base.
 *   - 15-row sample for YOE=5 to confirm each row satisfies the predicate.
 *   - Distribution of null vs non-null minYearsExperience across published jobs.
 *   - YOE=0 edge cases (must match null, must NOT match min=5).
 *
 * Run: npx tsx scripts/_audit-min-years.ts
 */

import { config as dotenvConfig } from 'dotenv';
// Pick env via --env=prod|dev (default: prod). Falls back to .env.local for dev.
const envFlag = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1] ?? 'prod';
if (envFlag === 'dev') {
  dotenvConfig({ path: '.env.local' });
} else {
  dotenvConfig({ path: '.env.prod' });
  if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
  }
}
console.log(`[env] using ${envFlag} (DATABASE_URL host: ${(process.env.DATABASE_URL || '').match(/@([^/:]+)/)?.[1] || 'unknown'})`);

const PUBLISHED = { isPublished: true };

const qualifiesFor = (n: number) => ({
  AND: [
    PUBLISHED,
    { OR: [{ minYearsExperience: { lte: n } }, { minYearsExperience: null }] },
  ],
});

async function main() {
  const { prisma } = await import('../lib/prisma');

  // Pre-flight: confirm min_years_experience column exists in the live DB.
  const colCheck = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'jobs' AND column_name = 'min_years_experience'`,
  );
  if (colCheck.length === 0) {
    console.error(
      '[FATAL] jobs.min_years_experience does not exist in the connected DB.\n' +
        '  Migration prisma/migrations/20260514_add_experience_fields has NOT been applied.\n' +
        '  Run: npx prisma migrate deploy (against the prod connection string).',
    );
    await prisma.$disconnect();
    process.exit(2);
  }

  const total = await prisma.job.count({ where: PUBLISHED });
  const nullCount = await prisma.job.count({
    where: { ...PUBLISHED, minYearsExperience: null },
  });
  const nonNullCount = total - nullCount;

  console.log('=== minYearsExperience distribution (published jobs) ===');
  console.log(`  total published:    ${total}`);
  console.log(
    `  minYears IS NULL:   ${nullCount}  (${((nullCount / total) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  minYears NOT NULL:  ${nonNullCount}  (${((nonNullCount / total) * 100).toFixed(1)}%)`,
  );

  console.log('\n=== Match counts per candidate YOE ===');
  for (const yoe of [0, 1, 3, 5, 10]) {
    const c = await prisma.job.count({ where: qualifiesFor(yoe) });
    console.log(`  YOE=${yoe.toString().padStart(2)}:  ${c}  (${((c / total) * 100).toFixed(1)}% of board)`);
  }

  // Sample audit at YOE=5
  console.log('\n=== Sample of 15 jobs matching YOE=5 ===');
  const sample = await prisma.job.findMany({
    where: qualifiesFor(5),
    select: { id: true, title: true, minYearsExperience: true },
    take: 15,
    orderBy: { createdAt: 'desc' },
  });

  let ok = 0;
  let bad = 0;
  for (const j of sample) {
    const m = j.minYearsExperience;
    const passes = m === null || m <= 5;
    const tag = passes ? 'OK ' : 'BAD';
    if (passes) ok++;
    else bad++;
    const minStr = m === null ? 'null' : String(m);
    console.log(`  [${tag}] min=${minStr.padStart(4)}  ${j.title.slice(0, 70)}`);
  }
  console.log(`  -> ${ok}/${sample.length} pass, ${bad} violations`);

  // Edge case: YOE=0 must match null
  console.log('\n=== Edge case: YOE=0 vs null jobs ===');
  const yoe0MatchesNull = await prisma.job.count({
    where: {
      AND: [
        PUBLISHED,
        { minYearsExperience: null },
        { OR: [{ minYearsExperience: { lte: 0 } }, { minYearsExperience: null }] },
      ],
    },
  });
  console.log(
    `  YOE=0 matches ${yoe0MatchesNull} null-min jobs (should equal ${nullCount}): ${
      yoe0MatchesNull === nullCount ? 'PASS' : 'FAIL'
    }`,
  );

  // Edge case: YOE=0 must NOT match min=5
  const yoe0HitsMin5 = await prisma.job.count({
    where: {
      AND: [
        PUBLISHED,
        { minYearsExperience: 5 },
        { OR: [{ minYearsExperience: { lte: 0 } }, { minYearsExperience: null }] },
      ],
    },
  });
  console.log(
    `  YOE=0 incorrectly matches min=5 jobs: ${yoe0HitsMin5} (should be 0): ${
      yoe0HitsMin5 === 0 ? 'PASS' : 'FAIL'
    }`,
  );

  await prisma.$disconnect();
}



main().catch((e) => {
  console.error(e);
  process.exit(1);
});
