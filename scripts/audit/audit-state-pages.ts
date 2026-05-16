/**
 * Audit pSEO state landing pages: filter ↔ result consistency.
 *
 * For 5 popular states (CA, TX, NY, FL, KS):
 *   1. Count /jobs/state/[slug]  (state OR stateCode match — mirrors page.tsx).
 *   2. Count /jobs?state=[slug]  (mirrors lib/filters.ts buildWhereClause —
 *      filters.location → OR[state equals, city contains]).
 *   3. Sample 10 rows from /jobs/state/[slug] and check whether structured
 *      location actually matches the route state.
 *   4. For Kansas specifically, scan the full /jobs/state/kansas result for
 *      jobs whose description body says "Missouri license" — the screenshot
 *      bug case (TeamHealth Wichita PMHNP).
 *
 * Read-only. Run with:
 *   npx tsx scripts/audit/audit-state-pages.ts          # prod (default)
 *   npx tsx scripts/audit/audit-state-pages.ts --dev    # local dev DB
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');

interface Target {
  slug: string;
  name: string;
  code: string;
}

const TARGETS: Target[] = [
  { slug: 'california', name: 'California', code: 'CA' },
  { slug: 'texas', name: 'Texas', code: 'TX' },
  { slug: 'new-york', name: 'New York', code: 'NY' },
  { slug: 'florida', name: 'Florida', code: 'FL' },
  { slug: 'kansas', name: 'Kansas', code: 'KS' },
];

/** /jobs/state/[s] WHERE — mirrors app/jobs/state/[state]/page.tsx */
function whereForStatePage(t: Target) {
  return {
    isPublished: true,
    OR: [{ state: t.name }, { stateCode: t.code }],
  };
}

/** /jobs?state=[s] WHERE — mirrors lib/filters.ts (filters.location branch).
 *  filters.location passes the human state name; clause is OR[state equals (i),
 *  city contains (i)]. We do NOT add stateCode here because filters.ts
 *  filters.location does not. */
function whereForJobsFilter(t: Target) {
  return {
    isPublished: true,
    OR: [
      { state: { equals: t.name, mode: 'insensitive' as const } },
      { city: { contains: t.name, mode: 'insensitive' as const } },
    ],
  };
}

interface SampleIssue {
  slug: string;
  title: string;
  state: string | null;
  stateCode: string | null;
  city: string | null;
  reason: string;
}

async function auditState(t: Target) {
  const stateCount = await prisma.job.count({ where: whereForStatePage(t) });
  const filterCount = await prisma.job.count({ where: whereForJobsFilter(t) });

  const sample = await prisma.job.findMany({
    where: whereForStatePage(t),
    select: {
      id: true,
      slug: true,
      title: true,
      employer: true,
      state: true,
      stateCode: true,
      city: true,
      description: true,
    },
    orderBy: [
      { isFeatured: 'desc' },
      { qualityScore: 'desc' },
      { originalPostedAt: 'desc' },
    ],
    take: 10,
  });

  const issues: SampleIssue[] = [];
  for (const j of sample) {
    const stateMatch = (j.state || '').trim().toLowerCase() === t.name.toLowerCase();
    const codeMatch = (j.stateCode || '').trim().toUpperCase() === t.code;
    if (!stateMatch && !codeMatch) {
      issues.push({
        slug: j.slug || j.id,
        title: j.title,
        state: j.state,
        stateCode: j.stateCode,
        city: j.city,
        reason: `state="${j.state}" code="${j.stateCode}" — neither equals "${t.name}"/"${t.code}"`,
      });
      continue;
    }
    // Cross-check: does the description mention a *different* state's license?
    const body = (j.description || '').toLowerCase();
    const OTHER_STATES = [
      ['Missouri', 'MO'], ['Kansas', 'KS'], ['Texas', 'TX'],
      ['Oklahoma', 'OK'], ['California', 'CA'], ['New York', 'NY'],
      ['Florida', 'FL'], ['Georgia', 'GA'], ['Illinois', 'IL'],
      ['Tennessee', 'TN'], ['Arkansas', 'AR'], ['Nebraska', 'NE'],
    ];
    for (const [otherName] of OTHER_STATES) {
      if (otherName === t.name) continue;
      const pattern = `${otherName.toLowerCase()} license`;
      if (body.includes(pattern)) {
        issues.push({
          slug: j.slug || j.id,
          title: j.title,
          state: j.state,
          stateCode: j.stateCode,
          city: j.city,
          reason: `body says "${otherName} license" but tagged ${j.state}/${j.stateCode}`,
        });
        break;
      }
    }
  }

  return { stateCount, filterCount, issues };
}

/** Kansas-specific deep dive: scan the FULL Kansas result set (not just the
 *  10-row sample) for jobs whose body says "Missouri license". */
async function kansasMissouriDeepDive() {
  const ks = TARGETS.find((t) => t.code === 'KS')!;
  const rows = await prisma.job.findMany({
    where: {
      ...whereForStatePage(ks),
      description: { contains: 'Missouri license', mode: 'insensitive' },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      employer: true,
      state: true,
      stateCode: true,
      city: true,
    },
  });
  return rows;
}

async function main() {
  console.log(`\n[audit-state-pages] env=${ENV}\n`);

  // Table 1: count parity.
  console.log('Table 1: /jobs/state/[s] vs /jobs?state=[s]');
  console.log('| State | /jobs/state/[s] count | /jobs?state=[s] count | Match? |');
  console.log('|---|---|---|---|');
  const perState: Record<string, { stateCount: number; filterCount: number; issues: SampleIssue[] }> = {};
  for (const t of TARGETS) {
    const r = await auditState(t);
    perState[t.slug] = r;
    const match = r.stateCount === r.filterCount ? 'YES' : `NO (Δ ${r.stateCount - r.filterCount})`;
    console.log(`| ${t.name} | ${r.stateCount} | ${r.filterCount} | ${match} |`);
  }

  // Table 2: sample mismatches.
  console.log('\nTable 2: Sample mismatches');
  console.log('| State | Mismatches (sample) | Sample slug | Reason |');
  console.log('|---|---|---|---|');
  let anyIssue = false;
  for (const t of TARGETS) {
    const r = perState[t.slug];
    if (r.issues.length === 0) {
      console.log(`| ${t.name} | 0 / 10 | — | — |`);
      continue;
    }
    anyIssue = true;
    for (const iss of r.issues) {
      console.log(`| ${t.name} | ${r.issues.length} / 10 | ${iss.slug} | ${iss.reason} |`);
    }
  }
  if (!anyIssue) console.log('(no sample-level mismatches found)');

  // Kansas deep dive.
  console.log('\nKansas deep dive: jobs on /jobs/state/kansas whose body says "Missouri license"');
  const ksRows = await kansasMissouriDeepDive();
  if (ksRows.length === 0) {
    console.log('  (none)');
  } else {
    console.log(`  Found ${ksRows.length} job(s):`);
    for (const r of ksRows) {
      console.log(`    · "${r.title}" by ${r.employer} | city=${r.city} state=${r.state} code=${r.stateCode}`);
      console.log(`      slug=${r.slug || r.id}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
