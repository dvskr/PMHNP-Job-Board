/**
 * Audit freshness filter.
 *
 * For each window (24h / 3d / 7d / 30d):
 *   - count matched jobs
 *   - sample 10, print createdAt / originalPostedAt / source
 *   - verify dates fall inside the expected window
 *
 * For 24h specifically: assert BOTH createdAt >= now-24h AND
 * originalPostedAt >= now-72h.
 *
 * Also reports counts of jobs with originalPostedAt = null.
 *
 * Run: npx tsx scripts/_audit-freshness.ts            (default: prod)
 *      npx tsx scripts/_audit-freshness.ts --dev      (use .env)
 */

import { config as dotenvConfig } from 'dotenv';

type EnvKind = 'dev' | 'prod';
function parseEnvFlag(): EnvKind {
  const flag = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
  if (flag === 'dev' || flag === 'prod') return flag;
  if (process.argv.includes('--dev')) return 'dev';
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

// Dynamic import — must run AFTER dotenv has populated DATABASE_URL.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { freshnessClause } = require('@/lib/filters') as typeof import('@/lib/filters');
import type { PostedWithinWindow } from '@/lib/filters';

type Row = {
  id: string;
  title: string;
  employer: string;
  createdAt: Date;
  originalPostedAt: Date | null;
  sourceType: string | null;
  sourceProvider: string | null;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * ONE_DAY_MS;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;

function fmt(d: Date | null): string {
  if (!d) return 'null';
  return d.toISOString();
}

function ageDays(d: Date | null, now: Date): string {
  if (!d) return 'null';
  return ((now.getTime() - d.getTime()) / ONE_DAY_MS).toFixed(2) + 'd';
}

function sourceLabel(r: Row): string {
  if (!r.sourceType && !r.sourceProvider) return 'employer-posted';
  return `${r.sourceType ?? '?'}/${r.sourceProvider ?? '?'}`;
}

async function auditWindow(window: PostedWithinWindow, now: Date) {
  const clause = freshnessClause(now, window);

  const whereBase = { isPublished: true, AND: [clause] };

  const count = await prisma.job.count({ where: whereBase });

  const samples = (await prisma.job.findMany({
    where: whereBase,
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      employer: true,
      createdAt: true,
      originalPostedAt: true,
      sourceType: true,
      sourceProvider: true,
    },
  })) as Row[];

  console.log(`\n=== Window: ${window} ===`);
  console.log(`Count: ${count.toLocaleString()}`);
  console.log(`Clause: ${JSON.stringify(clause)}`);
  console.log('\nSample (most recent 10):');
  console.log(
    'createdAt(age)            | originalPostedAt(age)     | source                 | title'
  );
  console.log('-'.repeat(140));

  let violations = 0;
  for (const r of samples) {
    const inWindow = verifyInWindow(r, window, now);
    if (!inWindow.ok) violations++;
    const flag = inWindow.ok ? '  ' : 'X ';
    console.log(
      `${flag}${fmt(r.createdAt)}(${ageDays(r.createdAt, now).padStart(7)}) | ${fmt(
        r.originalPostedAt,
      )}(${ageDays(r.originalPostedAt, now).padStart(7)}) | ${sourceLabel(r).padEnd(22)} | ${r.title.slice(0, 60)}`
    );
    if (!inWindow.ok) console.log(`    -> VIOLATION: ${inWindow.reason}`);
  }

  if (violations === 0) {
    console.log(`\n  All ${samples.length} samples satisfy the window predicate.`);
  } else {
    console.log(`\n  ${violations}/${samples.length} samples VIOLATE the window predicate.`);
  }

  return { window, count, sampleSize: samples.length, violations };
}

function verifyInWindow(
  r: Row,
  window: PostedWithinWindow,
  now: Date,
): { ok: boolean; reason?: string } {
  const t = now.getTime();
  if (window === '24h') {
    if (r.originalPostedAt === null) {
      return { ok: false, reason: 'originalPostedAt is null but filter requires gte' };
    }
    if (r.createdAt.getTime() < t - ONE_DAY_MS) {
      return { ok: false, reason: `createdAt older than 24h (age ${ageDays(r.createdAt, now)})` };
    }
    if (r.originalPostedAt.getTime() < t - THREE_DAYS_MS) {
      return {
        ok: false,
        reason: `originalPostedAt older than 72h (age ${ageDays(r.originalPostedAt, now)})`,
      };
    }
    return { ok: true };
  }
  const cutoff =
    window === '3d' ? t - THREE_DAYS_MS : window === '7d' ? t - SEVEN_DAYS_MS : t - THIRTY_DAYS_MS;
  if (r.originalPostedAt === null) {
    return { ok: false, reason: 'originalPostedAt is null but filter requires gte' };
  }
  if (r.originalPostedAt.getTime() < cutoff) {
    return {
      ok: false,
      reason: `originalPostedAt older than ${window} (age ${ageDays(r.originalPostedAt, now)})`,
    };
  }
  return { ok: true };
}

async function nullAudit() {
  console.log('\n=== Null originalPostedAt audit ===');
  const totalPublished = await prisma.job.count({ where: { isPublished: true } });
  const nullOriginal = await prisma.job.count({
    where: { isPublished: true, originalPostedAt: null },
  });

  console.log(`Total published jobs: ${totalPublished.toLocaleString()}`);
  console.log(
    `Published with originalPostedAt = null: ${nullOriginal.toLocaleString()} (${(
      (nullOriginal / Math.max(totalPublished, 1)) *
      100
    ).toFixed(2)}%)`,
  );

  if (nullOriginal > 0) {
    const samples = await prisma.job.findMany({
      where: { isPublished: true, originalPostedAt: null },
      take: 5,
      select: {
        id: true,
        title: true,
        employer: true,
        createdAt: true,
        sourceType: true,
        sourceProvider: true,
      },
    });
    console.log('\nSample null-originalPostedAt rows:');
    for (const r of samples) {
      const s = !r.sourceType && !r.sourceProvider ? 'employer-posted' : `${r.sourceType}/${r.sourceProvider}`;
      console.log(`  ${r.id}  created=${fmt(r.createdAt)}  source=${s}  title=${r.title.slice(0, 60)}`);
    }
    console.log(
      '\nNOTE: these rows will be FILTERED OUT by every postedWithin window (3d/7d/30d strict on originalPostedAt).',
    );
  } else {
    console.log('  No null rows — normalizer default ("new Date()") covering all inventory.');
  }

  // Employer-posted breakdown
  const employerPosted = await prisma.job.count({
    where: { isPublished: true, sourceType: null, sourceProvider: null },
  });
  const employerPostedNullOriginal = await prisma.job.count({
    where: {
      isPublished: true,
      sourceType: null,
      sourceProvider: null,
      originalPostedAt: null,
    },
  });
  console.log(`\nEmployer-posted (sourceType+Provider both null): ${employerPosted.toLocaleString()}`);
  console.log(`  ...of which originalPostedAt is null: ${employerPostedNullOriginal.toLocaleString()}`);
}

async function main() {
  const now = new Date();
  console.log(`Audit clock: ${now.toISOString()}\n`);
  console.log('Implementation reference: lib/filters.ts:21-37 (freshnessClause)');
  console.log('Used by: app/api/jobs/filter-counts/route.ts:135-149 and buildWhereClause()\n');

  const results = [];
  for (const w of ['24h', '3d', '7d', '30d'] as PostedWithinWindow[]) {
    results.push(await auditWindow(w, now));
  }

  await nullAudit();

  console.log('\n=== Summary ===');
  console.log('window | count | sample | violations');
  for (const r of results) {
    console.log(
      `${r.window.padEnd(6)} | ${String(r.count).padStart(6)} | ${String(r.sampleSize).padStart(6)} | ${r.violations}`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
