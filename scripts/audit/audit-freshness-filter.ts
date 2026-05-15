/**
 * Audit freshness filter (24h / 3d / 7d / 30d / all).
 *
 * Policy (lib/filters.ts:freshnessClause, project memory project_freshness_policy.md):
 *   24h  → AND(createdAt ≥ now-1d, originalPostedAt ≥ now-3d)
 *   3d   → originalPostedAt ≥ now-3d   (strict)
 *   7d   → originalPostedAt ≥ now-7d   (strict)
 *   30d  → originalPostedAt ≥ now-30d  (strict)
 *   all  → no freshness constraint
 *
 * What this script does:
 *   1. For each window: count, monotonicity check, 5-row sample.
 *   2. 24h policy violation scan: find any row in the 24h result that
 *      breaks createdAt < 1d OR originalPostedAt < 3d.
 *   3. Cross-check counts against the route used by /api/jobs/filter-counts
 *      (we call freshnessClause through prisma the same way the route does;
 *      a separate HTTP probe is provided behind --probe-api).
 *
 * Run:
 *   npx tsx scripts/audit/audit-freshness-filter.ts            (prod)
 *   npx tsx scripts/audit/audit-freshness-filter.ts --dev      (local .env)
 *   npx tsx scripts/audit/audit-freshness-filter.ts --probe-api http://localhost:3000
 */
import { config as dotenvConfig } from 'dotenv';

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

// Dynamic import — must run AFTER dotenv populates DATABASE_URL.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { freshnessClause } = require('@/lib/filters') as typeof import('@/lib/filters');
import type { PostedWithinWindow } from '@/lib/filters';

const MS_DAY = 24 * 60 * 60 * 1000;
const MS_3D = 3 * MS_DAY;

type WindowKey = PostedWithinWindow | 'all';
const WINDOWS: WindowKey[] = ['24h', '3d', '7d', '30d', 'all'];

type SampleRow = {
  id: string;
  slug: string | null;
  title: string;
  createdAt: Date;
  originalPostedAt: Date | null;
};

type WindowResult = {
  window: WindowKey;
  count: number;
  minCreatedAt: Date | null;
  maxOriginalAgeDays: number | null;
  samples: SampleRow[];
};

function ageDays(d: Date | null, now: Date): number | null {
  if (!d) return null;
  return (now.getTime() - d.getTime()) / MS_DAY;
}

function fmtAge(d: Date | null, now: Date): string {
  const a = ageDays(d, now);
  return a === null ? 'null' : `${a.toFixed(2)}d`;
}

function fmt(d: Date | null): string {
  return d ? d.toISOString() : 'null';
}

async function countAndSample(window: WindowKey, now: Date): Promise<WindowResult> {
  const where =
    window === 'all'
      ? { isPublished: true }
      : { isPublished: true, AND: [freshnessClause(now, window)] };

  const [count, samples, oldestCreated, freshestOriginal] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        createdAt: true,
        originalPostedAt: true,
      },
    }) as Promise<SampleRow[]>,
    prisma.job.findFirst({
      where,
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    prisma.job.findFirst({
      where,
      orderBy: { originalPostedAt: 'asc' },
      select: { originalPostedAt: true },
    }),
  ]);

  return {
    window,
    count,
    minCreatedAt: oldestCreated?.createdAt ?? null,
    maxOriginalAgeDays: ageDays(freshestOriginal?.originalPostedAt ?? null, now),
    samples,
  };
}

async function scan24hPolicyViolations(now: Date) {
  // Any row that the 24h clause matched MUST have createdAt within 1d AND
  // originalPostedAt within 3d. We pull the entire 24h set and verify in JS.
  const clause = freshnessClause(now, '24h');
  const rows = (await prisma.job.findMany({
    where: { isPublished: true, AND: [clause] },
    select: {
      id: true,
      slug: true,
      title: true,
      createdAt: true,
      originalPostedAt: true,
    },
  })) as SampleRow[];

  const t = now.getTime();
  const violations = rows.filter((r) => {
    if (!r.originalPostedAt) return true;
    if (r.createdAt.getTime() < t - MS_DAY) return true;
    if (r.originalPostedAt.getTime() < t - MS_3D) return true;
    return false;
  });

  return { total: rows.length, violations };
}

function checkMonotonicity(results: WindowResult[]): { ok: boolean; note: string } {
  const byKey = Object.fromEntries(results.map((r) => [r.window, r.count])) as Record<
    WindowKey,
    number
  >;
  const order: WindowKey[] = ['24h', '3d', '7d', '30d', 'all'];
  for (let i = 0; i < order.length - 1; i++) {
    const a = byKey[order[i]];
    const b = byKey[order[i + 1]];
    if (a > b) {
      return { ok: false, note: `${order[i]}=${a} > ${order[i + 1]}=${b}` };
    }
  }
  return { ok: true, note: `24h(${byKey['24h']}) ≤ 3d(${byKey['3d']}) ≤ 7d(${byKey['7d']}) ≤ 30d(${byKey['30d']}) ≤ all(${byKey['all']})` };
}

async function probeFilterCountsApi(baseUrl: string) {
  console.log(`\n[probe] POST ${baseUrl}/api/jobs/filter-counts`);
  const empty = {
    search: '',
    workMode: [],
    jobType: [],
    specialty: [],
    experienceLevel: [],
    newGradFriendly: null,
    minYearsExperience: null,
    salaryMin: null,
    postedWithin: null,
    location: null,
    cityExact: null,
    stateCode: null,
    employer: null,
    category: null,
  };
  try {
    const res = await fetch(`${baseUrl}/api/jobs/filter-counts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(empty),
    });
    if (!res.ok) {
      console.log(`[probe] HTTP ${res.status} ${res.statusText}`);
      return null;
    }
    const json = (await res.json()) as { postedWithin: Record<string, number>; total: number };
    return json;
  } catch (e) {
    console.log(`[probe] error: ${(e as Error).message}`);
    return null;
  }
}

async function main() {
  const now = new Date();
  console.log(`[audit-freshness-filter] env=${ENV}  clock=${now.toISOString()}\n`);

  const results: WindowResult[] = [];
  for (const w of WINDOWS) {
    results.push(await countAndSample(w, now));
  }

  // Summary table
  console.log('| Window | Count | Min createdAt | Max originalPostedAt age |');
  console.log('|---|---|---|---|');
  for (const r of results) {
    const minC = r.minCreatedAt ? r.minCreatedAt.toISOString() : 'n/a';
    const maxOrig =
      r.maxOriginalAgeDays === null ? 'n/a' : `${r.maxOriginalAgeDays.toFixed(2)}d`;
    console.log(`| ${r.window} | ${r.count} | ${minC} | ${maxOrig} |`);
  }

  // Monotonicity
  const mono = checkMonotonicity(results);
  console.log('\n| Monotonicity check | Pass/Fail | Note |');
  console.log('|---|---|---|');
  console.log(`| 24h ≤ 3d ≤ 7d ≤ 30d ≤ all | ${mono.ok ? 'Pass' : 'Fail'} | ${mono.note} |`);

  // Samples
  console.log('\n--- Samples (5 most-recent per window) ---');
  for (const r of results) {
    console.log(`\n[${r.window}] count=${r.count}`);
    for (const s of r.samples) {
      console.log(
        `  ${s.slug ?? s.id}  createdAt=${fmt(s.createdAt)} (${fmtAge(s.createdAt, now)})  originalPostedAt=${fmt(s.originalPostedAt)} (${fmtAge(s.originalPostedAt, now)})  | ${s.title.slice(0, 70)}`,
      );
    }
  }

  // 24h policy violations
  const v = await scan24hPolicyViolations(now);
  console.log('\n| 24h-policy violations | Count | Sample slug |');
  console.log('|---|---|---|');
  if (v.violations.length === 0) {
    console.log(`| createdAt<1d AND originalPostedAt<3d | 0 of ${v.total} | — |`);
  } else {
    const sample = v.violations[0];
    console.log(
      `| createdAt<1d AND originalPostedAt<3d | ${v.violations.length} of ${v.total} | ${sample.slug ?? sample.id} |`,
    );
    console.log('\nFirst 5 violations:');
    for (const r of v.violations.slice(0, 5)) {
      console.log(
        `  ${r.slug ?? r.id}  createdAt=${fmt(r.createdAt)} (${fmtAge(r.createdAt, now)})  originalPostedAt=${fmt(r.originalPostedAt)} (${fmtAge(r.originalPostedAt, now)})`,
      );
    }
  }

  // Optional HTTP cross-check
  const probeFlag = process.argv.find((a) => a.startsWith('--probe-api'));
  if (probeFlag) {
    const baseUrl = probeFlag.includes('=')
      ? probeFlag.split('=')[1]
      : process.argv[process.argv.indexOf(probeFlag) + 1] || 'http://localhost:3000';
    const api = await probeFilterCountsApi(baseUrl);
    if (api) {
      console.log('\n| Window | DB count | API count | Match |');
      console.log('|---|---|---|---|');
      const dbBy = Object.fromEntries(results.map((r) => [r.window, r.count])) as Record<
        WindowKey,
        number
      >;
      for (const w of ['24h', '3d', '7d', '30d'] as PostedWithinWindow[]) {
        const dbN = dbBy[w];
        const apiN = api.postedWithin[w];
        console.log(`| ${w} | ${dbN} | ${apiN} | ${dbN === apiN ? 'Pass' : 'Fail'} |`);
      }
      console.log(`| all (total) | ${dbBy['all']} | ${api.total} | ${dbBy['all'] === api.total ? 'Pass' : 'Fail'} |`);
    }
  } else {
    console.log(
      '\n[info] cross-check vs /api/jobs/filter-counts skipped. Re-run with --probe-api=http://localhost:3000 (or prod URL) to compare.',
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
