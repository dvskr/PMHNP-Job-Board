/**
 * Audit: filter-counts badge counts vs buildWhereClause actual results.
 *
 * For every filter the sidebar exposes, this script computes:
 *   (1) the count produced by app/api/jobs/filter-counts/route.ts
 *   (2) the count produced by buildWhereClause(filters) — i.e. what the
 *       /api/jobs listing endpoint actually returns when that filter is on
 *
 * Any drift is a user-visible bug: the badge says 167 but the page shows
 * 29. Run after schema changes to CATEGORY_FILTERS / CATEGORY_EXCLUSIONS
 * / GLOBAL_EXCLUSIONS / freshnessClause.
 *
 *   npx tsx scripts/_audit-filter-counts.ts
 */
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import {
  buildWhereClause,
  freshnessClause,
  CATEGORY_FILTERS,
  CATEGORY_EXCLUSIONS,
} from '@/lib/filters';
import { DEFAULT_FILTERS, type FilterState } from '@/types/filters';

interface Row {
  filter: string;
  badge: number;
  actual: number;
  drift: number;
  match: boolean;
}

const rows: Row[] = [];
const now = new Date();

function emptyFilters(): FilterState {
  return { ...DEFAULT_FILTERS };
}

async function countWith(where: Prisma.JobWhereInput): Promise<number> {
  return prisma.job.count({ where });
}

async function compare(label: string, badgeWhere: Prisma.JobWhereInput, actualFilters: FilterState) {
  const [badge, actual] = await Promise.all([
    countWith(badgeWhere),
    countWith(buildWhereClause(actualFilters)),
  ]);
  rows.push({
    filter: label,
    badge,
    actual,
    drift: actual - badge,
    match: badge === actual,
  });
}

async function main() {
  const base = emptyFilters();
  const baseWhere = buildWhereClause(base);

  // ────────────────────────────────────────────────────────────────────
  // workMode: filter-counts ANDs baseWhere with the raw boolean clause.
  // buildWhereClause wraps the same clause in an OR of selected modes.
  // For a single-mode selection the two should match exactly.
  // ────────────────────────────────────────────────────────────────────
  await compare(
    'workMode: remote',
    { AND: [baseWhere, { isRemote: true }] },
    { ...base, workMode: ['remote'] },
  );
  await compare(
    'workMode: hybrid',
    { AND: [baseWhere, { isHybrid: true }] },
    { ...base, workMode: ['hybrid'] },
  );
  await compare(
    'workMode: onsite',
    { AND: [baseWhere, { isRemote: false, isHybrid: false }] },
    { ...base, workMode: ['onsite'] },
  );

  // ────────────────────────────────────────────────────────────────────
  // jobType: groupBy({ by: ['jobType'], where: jobTypeBase }) — the badge
  // uses raw jobType equality with no further filtering. buildWhereClause
  // uses `jobType: { in: [...] }`. Same shape.
  // ────────────────────────────────────────────────────────────────────
  const jobTypes = ['Full-Time', 'Part-Time', 'Contract', 'Per Diem'];
  const groupBadges = await prisma.job.groupBy({
    by: ['jobType'],
    where: baseWhere,
    _count: { _all: true },
  });
  const badgeMap = new Map<string | null, number>();
  for (const g of groupBadges) badgeMap.set(g.jobType, g._count._all);

  for (const jt of jobTypes) {
    const badge = badgeMap.get(jt) ?? 0;
    const actual = await countWith(buildWhereClause({ ...base, jobType: [jt] }));
    rows.push({ filter: `jobType: ${jt}`, badge, actual, drift: actual - badge, match: badge === actual });
  }
  // "Other" = NULL jobType
  const badgeOther = badgeMap.get(null) ?? 0;
  const actualOther = await countWith(buildWhereClause({ ...base, jobType: ['Other'] }));
  rows.push({ filter: 'jobType: Other (NULL)', badge: badgeOther, actual: actualOther, drift: actualOther - badgeOther, match: badgeOther === actualOther });

  // ────────────────────────────────────────────────────────────────────
  // salary
  // ────────────────────────────────────────────────────────────────────
  for (const min of [100000, 150000, 200000]) {
    const badgeWhere: Prisma.JobWhereInput = {
      AND: [
        baseWhere,
        { OR: [{ normalizedMinSalary: { gte: min } }, { normalizedMaxSalary: { gte: min } }] },
      ],
    };
    await compare(`salary: ≥${min / 1000}k`, badgeWhere, { ...base, salaryMin: min });
  }

  // ────────────────────────────────────────────────────────────────────
  // postedWithin: filter-counts uses freshnessClause directly. So does
  // buildWhereClause. Same call → should match.
  // ────────────────────────────────────────────────────────────────────
  for (const w of ['24h', '3d', '7d', '30d'] as const) {
    const badgeWhere: Prisma.JobWhereInput = {
      AND: [baseWhere, freshnessClause(now, w)],
    };
    await compare(`postedWithin: ${w}`, badgeWhere, { ...base, postedWithin: w });
  }

  // ────────────────────────────────────────────────────────────────────
  // specialty: badge uses spread `{...specialtyBase, OR: [...]}` which
  // OVERWRITES the AND chain on collision risk. buildWhereClause uses a
  // dedicated `OR` inside the AND chain. Logically equivalent ONLY if
  // specialtyBase has no top-level OR (it doesn't — buildWhereClause
  // only ever puts conditions inside AND). Still worth testing.
  // ────────────────────────────────────────────────────────────────────
  const telehealthBadge: Prisma.JobWhereInput = {
    ...baseWhere,
    OR: [
      { title: { contains: 'telehealth', mode: 'insensitive' } },
      { title: { contains: 'telemedicine', mode: 'insensitive' } },
      { title: { contains: 'telepsychiatry', mode: 'insensitive' } },
      { description: { contains: 'telehealth', mode: 'insensitive' } },
      { description: { contains: 'telemedicine', mode: 'insensitive' } },
    ],
  };
  await compare('specialty: Telehealth', telehealthBadge, { ...base, specialty: ['Telehealth'] });

  const travelBadge: Prisma.JobWhereInput = {
    ...baseWhere,
    OR: [
      { title: { contains: 'travel', mode: 'insensitive' } },
      { title: { contains: 'locum', mode: 'insensitive' } },
    ],
  };
  await compare('specialty: Travel', travelBadge, { ...base, specialty: ['Travel'] });

  // ────────────────────────────────────────────────────────────────────
  // experienceLevel: groupBy on the column. buildWhereClause uses `in`.
  // ────────────────────────────────────────────────────────────────────
  const expGroup = await prisma.job.groupBy({
    by: ['experienceLevel'],
    where: baseWhere,
    _count: { _all: true },
  });
  const expMap = new Map<string | null, number>();
  for (const g of expGroup) expMap.set(g.experienceLevel, g._count._all);
  for (const lvl of ['New Grad', 'Mid-Level', 'Senior']) {
    const badge = expMap.get(lvl) ?? 0;
    const actual = await countWith(buildWhereClause({ ...base, experienceLevel: [lvl] }));
    rows.push({ filter: `experienceLevel: ${lvl}`, badge, actual, drift: actual - badge, match: badge === actual });
  }

  // ────────────────────────────────────────────────────────────────────
  // newGradFriendly — the unified clause (recent fix). Should match.
  // ────────────────────────────────────────────────────────────────────
  const ngOr: Prisma.JobWhereInput[] = [
    { newGradFriendly: true },
    ...(CATEGORY_FILTERS['new-grad'] ?? []),
  ];
  const ngNot: Prisma.JobWhereInput[] = (CATEGORY_EXCLUSIONS['new-grad'] ?? []).map((ex) => ({ NOT: ex }));
  const ngBadge: Prisma.JobWhereInput = {
    AND: [baseWhere, { AND: [{ OR: ngOr }, ...ngNot] }],
  };
  await compare('newGradFriendly', ngBadge, { ...base, newGradFriendly: true });

  // ────────────────────────────────────────────────────────────────────
  // minYearsExperience — candidate-qualifies (≤ N OR null)
  // ────────────────────────────────────────────────────────────────────
  for (const n of [1, 2, 5, 7, 10]) {
    const badgeWhere: Prisma.JobWhereInput = {
      AND: [baseWhere, { OR: [{ minYearsExperience: { lte: n } }, { minYearsExperience: null }] }],
    };
    await compare(`minYears ≤ ${n}`, badgeWhere, { ...base, minYearsExperience: n });
  }

  // ────────────────────────────────────────────────────────────────────
  // Total
  // ────────────────────────────────────────────────────────────────────
  await compare('TOTAL (no filters)', baseWhere, base);

  // ────────────────────────────────────────────────────────────────────
  // Print
  // ────────────────────────────────────────────────────────────────────
  const drifts = rows.filter((r) => !r.match);
  const w = {
    filter: Math.max(20, ...rows.map((r) => r.filter.length)),
    badge: 8,
    actual: 8,
    drift: 8,
  };
  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  console.log('\n=== Filter-Counts vs buildWhereClause Audit ===\n');
  console.log(
    pad('Filter', w.filter),
    pad('badge', w.badge),
    pad('actual', w.actual),
    pad('drift', w.drift),
    'match',
  );
  console.log('-'.repeat(w.filter + w.badge + w.actual + w.drift + 10));
  for (const r of rows) {
    console.log(
      pad(r.filter, w.filter),
      pad(r.badge, w.badge),
      pad(r.actual, w.actual),
      pad(r.drift, w.drift),
      r.match ? 'OK' : 'DRIFT',
    );
  }
  console.log(`\n${drifts.length} drift${drifts.length === 1 ? '' : 's'} detected.`);
  if (drifts.length) {
    console.log('\nPunch list:');
    for (const d of drifts) {
      console.log(`  - ${d.filter}: badge=${d.badge}, actual=${d.actual} (drift ${d.drift > 0 ? '+' : ''}${d.drift})`);
    }
  }
  await prisma.$disconnect();
  process.exit(drifts.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect().finally(() => process.exit(2));
});
