/**
 * audit-filter-counts.ts
 *
 * Verifies that the badge counts emitted by /api/jobs/filter-counts agree
 * with the row counts produced by /api/jobs (buildWhereClause) when the
 * corresponding filter is selected.
 *
 * For each test case:
 *   1. Build a FilterState with NO filter selected for the dimension under
 *      test (the "base" used by filter-counts).
 *   2. Compute the badge count via the same expression filter-counts uses
 *      (buildWhereClause(base) AND-ed with the dimension predicate).
 *   3. Compute the actual /jobs count via buildWhereClause(base + selected
 *      filter) — what the user lands on after clicking the badge.
 *   4. Assert badge === actual. Report mismatches.
 *
 * Run:  npx tsx scripts/audit/audit-filter-counts.ts
 */

import { prisma } from '../../lib/prisma';
import type { Prisma } from '@prisma/client';
import {
  buildWhereClause,
  freshnessClause,
  CATEGORY_FILTERS,
  CATEGORY_EXCLUSIONS,
} from '../../lib/filters';
import { DEFAULT_FILTERS, FilterState } from '../../types/filters';

type Case = {
  name: string;
  base: FilterState;
  // Badge: what filter-counts route would compute.
  badge: Prisma.JobWhereInput;
  // Actual: what /api/jobs returns when the user applies the filter.
  applied: FilterState;
};

const NOW = new Date();

function withBase(overrides: Partial<FilterState>): FilterState {
  return { ...DEFAULT_FILTERS, ...overrides };
}

function makeNewGradMatchClause(): Prisma.JobWhereInput {
  const or: Prisma.JobWhereInput[] = [
    { newGradFriendly: true },
    ...(CATEGORY_FILTERS['new-grad'] ?? []),
  ];
  const nots: Prisma.JobWhereInput[] = (CATEGORY_EXCLUSIONS['new-grad'] ?? []).map((ex) => ({ NOT: ex }));
  return { AND: [{ OR: or }, ...nots] };
}

function qualifiesFor(n: number): Prisma.JobWhereInput {
  return { OR: [{ minYearsExperience: { lte: n } }, { minYearsExperience: null }] };
}

const cases: Case[] = [
  {
    name: 'workMode.remote',
    base: withBase({}),
    badge: { AND: [buildWhereClause(withBase({ workMode: [] })), { isRemote: true }] },
    applied: withBase({ workMode: ['remote'] }),
  },
  {
    name: 'workMode.onsite',
    base: withBase({}),
    badge: { AND: [buildWhereClause(withBase({ workMode: [] })), { isRemote: false, isHybrid: false }] },
    applied: withBase({ workMode: ['onsite'] }),
  },
  {
    name: 'jobType.Full-Time',
    base: withBase({}),
    badge: { AND: [buildWhereClause(withBase({ jobType: [] })), { jobType: 'Full-Time' }] },
    applied: withBase({ jobType: ['Full-Time'] }),
  },
  {
    name: 'jobType.Other (NULL)',
    base: withBase({}),
    badge: { AND: [buildWhereClause(withBase({ jobType: [] })), { jobType: null }] },
    applied: withBase({ jobType: ['Other'] }),
  },
  {
    name: 'salary.over100k',
    base: withBase({}),
    badge: {
      AND: [
        buildWhereClause(withBase({ salaryMin: null })),
        { OR: [{ normalizedMinSalary: { gte: 100000 } }, { normalizedMaxSalary: { gte: 100000 } }] },
      ],
    },
    applied: withBase({ salaryMin: 100000 }),
  },
  {
    name: 'postedWithin.24h',
    base: withBase({}),
    badge: { AND: [buildWhereClause(withBase({ postedWithin: null })), freshnessClause(NOW, '24h')] },
    applied: withBase({ postedWithin: '24h' }),
  },
  {
    name: 'postedWithin.7d',
    base: withBase({}),
    badge: { AND: [buildWhereClause(withBase({ postedWithin: null })), freshnessClause(NOW, '7d')] },
    applied: withBase({ postedWithin: '7d' }),
  },
  {
    name: 'specialty.Telehealth',
    base: withBase({}),
    badge: {
      ...buildWhereClause(withBase({ specialty: [] })),
      OR: [
        { title: { contains: 'telehealth', mode: 'insensitive' } },
        { title: { contains: 'telemedicine', mode: 'insensitive' } },
        { title: { contains: 'telepsychiatry', mode: 'insensitive' } },
        { description: { contains: 'telehealth', mode: 'insensitive' } },
        { description: { contains: 'telemedicine', mode: 'insensitive' } },
      ],
    },
    applied: withBase({ specialty: ['Telehealth'] }),
  },
  {
    name: 'newGradFriendly (unified)',
    base: withBase({}),
    badge: { AND: [buildWhereClause(withBase({ newGradFriendly: null })), makeNewGradMatchClause()] },
    applied: withBase({ newGradFriendly: true }),
  },
  {
    name: 'minYears=5',
    base: withBase({}),
    badge: { AND: [buildWhereClause(withBase({ minYearsExperience: null })), qualifiesFor(5)] },
    applied: withBase({ minYearsExperience: 5 }),
  },
];

type Row = {
  name: string;
  badge: number;
  actual: number;
  match: boolean;
  diff: number;
};

async function main(): Promise<void> {
  const rows: Row[] = [];

  for (const c of cases) {
    const [badgeCount, actualCount] = await Promise.all([
      prisma.job.count({ where: c.badge }),
      prisma.job.count({ where: buildWhereClause(c.applied) }),
    ]);
    rows.push({
      name: c.name,
      badge: badgeCount,
      actual: actualCount,
      match: badgeCount === actualCount,
      diff: badgeCount - actualCount,
    });
  }

  /* eslint-disable no-console */
  console.log('\n=== Filter-Counts Parity Audit ===');
  console.log(
    'Case'.padEnd(30) +
      'Badge'.padStart(10) +
      'Actual'.padStart(10) +
      'Match'.padStart(8) +
      'Diff'.padStart(8),
  );
  console.log('-'.repeat(66));
  for (const r of rows) {
    console.log(
      r.name.padEnd(30) +
        String(r.badge).padStart(10) +
        String(r.actual).padStart(10) +
        (r.match ? 'OK' : 'FAIL').padStart(8) +
        String(r.diff).padStart(8),
    );
  }

  const failures = rows.filter((r) => !r.match);
  if (failures.length > 0) {
    console.error(`\n${failures.length} mismatch(es). Badge counts diverge from /jobs result set.`);
    process.exitCode = 1;
  } else {
    console.log('\nAll badge counts match /jobs result-set counts.');
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
