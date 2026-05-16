/**
 * Audit all 7 job-type category filters.
 * Counts, samples, and flags false-positives per category.
 *
 * Usage: npx tsx scripts/_audit-jobtype-filters.ts
 */
import { prisma } from '../lib/prisma';
import { buildCategoryWhereClause } from '../lib/filters';

const SLUGS = ['full-time', 'part-time', 'contract', 'per-diem', 'locum-tenens', 'travel', '1099'] as const;

// Heuristics to flag a sampled job as a probable false positive.
// Conservative: only flag obvious mismatches.
function falsePositiveReason(slug: string, title: string, description: string | null): string | null {
  const t = title.toLowerCase();
  const d = (description || '').toLowerCase();

  if (slug === 'locum-tenens') {
    // Must actually be locum / temporary
    if (!/\blocum/.test(t) && !/temporary assignment/.test(t)) return 'no "locum" or "temporary assignment" in title';
    return null;
  }
  if (slug === '1099') {
    // Must be 1099 / independent contractor
    if (!/\b1099\b/.test(t) && !/independent contractor/.test(t) && !/\b1099\b/.test(d)) {
      // matched only on "independent practice" — soft FP
      if (/independent practice/.test(t)) return 'matched "independent practice" only (not 1099)';
      return 'no 1099 / IC signal';
    }
    return null;
  }
  if (slug === 'travel') {
    // Must be travel-NP role
    if (!/\btravel/.test(t) && !/locum/.test(t) && !/traveling/.test(t)) {
      if (/assignment/.test(t)) return 'matched "assignment" only (could be non-travel)';
      return 'no travel signal';
    }
    return null;
  }
  if (slug === 'full-time') {
    if (!/full[- ]time|\bft\b|permanent/i.test(title)) return 'no FT signal';
    return null;
  }
  if (slug === 'part-time') {
    if (!/part[- ]time|\bprn\b/i.test(title)) return 'no PT/PRN signal';
    return null;
  }
  if (slug === 'contract') {
    if (!/contract|temporary|temp-to-perm/i.test(title)) return 'no contract signal';
    return null;
  }
  if (slug === 'per-diem') {
    if (!/per[- ]diem/i.test(title)) return 'no per-diem signal';
    return null;
  }
  return null;
}

async function auditSlug(slug: string) {
  const where = buildCategoryWhereClause(slug);
  const total = await prisma.job.count({ where });
  const sample = await prisma.job.findMany({
    where,
    select: { id: true, title: true, jobType: true, description: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const fps = sample
    .map((j) => ({ id: j.id, title: j.title, jobType: j.jobType, reason: falsePositiveReason(slug, j.title, j.description) }))
    .filter((j) => j.reason !== null);

  // jobType distribution within filter
  const jtDist = await prisma.job.groupBy({
    by: ['jobType'],
    where,
    _count: { _all: true },
    orderBy: { _count: { jobType: 'desc' } },
  });

  return { slug, total, sample, fps, jtDist };
}

async function main() {
  // Global stats
  const totalPublished = await prisma.job.count({ where: { isPublished: true } });
  const nullJobType = await prisma.job.count({ where: { isPublished: true, jobType: null } });
  const nonNullJobType = totalPublished - nullJobType;

  // Distinct jobType values site-wide
  const allTypes = await prisma.job.groupBy({
    by: ['jobType'],
    where: { isPublished: true },
    _count: { _all: true },
    orderBy: { _count: { jobType: 'desc' } },
  });

  console.log('═══ GLOBAL ═══');
  console.log(`Total published: ${totalPublished}`);
  console.log(`NULL jobType:    ${nullJobType} (${((nullJobType / totalPublished) * 100).toFixed(1)}%)`);
  console.log(`Non-null:        ${nonNullJobType}`);
  console.log('\nDistinct jobType values (top 15):');
  for (const row of allTypes.slice(0, 15)) {
    console.log(`  ${JSON.stringify(row.jobType).padEnd(30)} ${row._count._all}`);
  }
  console.log('');

  for (const slug of SLUGS) {
    const r = await auditSlug(slug);
    console.log(`═══ /${r.slug} ═══`);
    console.log(`DB count (buildCategoryWhereClause): ${r.total}`);
    console.log(`jobType distribution within filter:`);
    for (const row of r.jtDist.slice(0, 6)) {
      console.log(`  ${JSON.stringify(row.jobType).padEnd(30)} ${row._count._all}`);
    }
    console.log(`Sample (latest 10):`);
    for (const j of r.sample) {
      const fp = falsePositiveReason(slug, j.title, j.description);
      const flag = fp ? ` ⚠ ${fp}` : '';
      console.log(`  [${j.jobType || 'NULL'}] ${j.title.slice(0, 90)}${flag}`);
    }
    console.log(`False positives in sample of 10: ${r.fps.length}`);
    if (r.fps.length > 0) {
      console.log('  Worst offenders:');
      for (const j of r.fps.slice(0, 3)) {
        console.log(`    - "${j.title.slice(0, 100)}" (${j.reason})`);
      }
    }
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
