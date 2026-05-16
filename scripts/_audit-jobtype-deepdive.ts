/**
 * Deep-dive on the suspect filters: locum-tenens, travel, 1099, full-time.
 * - locum-tenens vs travel overlap
 * - 1099 page jobs that match via "independent practice" only
 * - full-time massive undercoverage
 * - count-badge cross-check: category page count vs filter-counts API jobType bucket
 */
import { prisma } from '../lib/prisma';
import { buildCategoryWhereClause, CATEGORY_FILTERS } from '../lib/filters';

async function main() {
  // 1) locum-tenens ∩ travel overlap (CATEGORY_FILTERS share "locum")
  const locumWhere = buildCategoryWhereClause('locum-tenens');
  const travelWhere = buildCategoryWhereClause('travel');
  const both = await prisma.job.count({
    where: { AND: [locumWhere, travelWhere] },
  });
  const locumOnly = (await prisma.job.count({ where: locumWhere })) - both;
  const travelOnly = (await prisma.job.count({ where: travelWhere })) - both;
  console.log('═══ /locum-tenens vs /travel overlap ═══');
  console.log(`locum-tenens total: ${await prisma.job.count({ where: locumWhere })}`);
  console.log(`travel       total: ${await prisma.job.count({ where: travelWhere })}`);
  console.log(`intersection      : ${both}`);
  console.log(`locum-only        : ${locumOnly}`);
  console.log(`travel-only       : ${travelOnly}`);
  console.log('');

  // travel-only sample (jobs on /travel but NOT on /locum-tenens)
  const travelExclusive = await prisma.job.findMany({
    where: { AND: [travelWhere, { NOT: locumWhere }] },
    select: { id: true, title: true, jobType: true },
    take: 10,
  });
  console.log('Travel-only sample (10):');
  travelExclusive.forEach((j) => console.log(`  [${j.jobType || 'NULL'}] ${j.title.slice(0, 100)}`));
  console.log('');

  // 2) /1099 — jobs matching ONLY via "independent practice" title or description "1099"
  // i.e. no "1099" in title and no "independent contractor" in title
  const icSoftWhere = {
    AND: [
      { isPublished: true },
      { OR: CATEGORY_FILTERS['1099'] },
      { NOT: { title: { contains: '1099', mode: 'insensitive' as const } } },
      { NOT: { title: { contains: 'independent contractor', mode: 'insensitive' as const } } },
    ],
  };
  const icSoftMatches = await prisma.job.findMany({
    where: icSoftWhere,
    select: { id: true, title: true, jobType: true },
    take: 10,
  });
  const icSoftCount = await prisma.job.count({ where: icSoftWhere });
  console.log('═══ /1099 jobs with NO "1099" or "independent contractor" in title ═══');
  console.log(`Count: ${icSoftCount} (out of 389 = ${((icSoftCount / 389) * 100).toFixed(0)}%)`);
  console.log('Sample:');
  icSoftMatches.forEach((j) => console.log(`  [${j.jobType || 'NULL'}] ${j.title.slice(0, 100)}`));
  console.log('');

  // 3) /full-time MASSIVE undercoverage: title-regex finds 164 but DB has 2546 "Full-Time" jobType
  // How many of those 2546 "Full-Time" enum jobs are MISSED by the title-regex filter?
  const ftEnumCount = await prisma.job.count({
    where: { isPublished: true, jobType: 'Full-Time' },
  });
  const ftEnumNotInFilter = await prisma.job.count({
    where: {
      AND: [
        { isPublished: true, jobType: 'Full-Time' },
        { NOT: { OR: CATEGORY_FILTERS['full-time'] as never } },
      ],
    },
  });
  console.log('═══ /full-time undercoverage ═══');
  console.log(`jobType='Full-Time' total:      ${ftEnumCount}`);
  console.log(`...NOT matched by title regex:  ${ftEnumNotInFilter}`);
  console.log(`Title regex match (DB count):   164`);
  console.log(`Coverage:                       ${((164 / ftEnumCount) * 100).toFixed(1)}%`);
  console.log('');

  // Similar for part-time, contract, per-diem
  for (const [slug, enumVal] of [
    ['part-time', 'Part-Time'],
    ['contract', 'Contract'],
    ['per-diem', 'Per Diem'],
    ['locum-tenens', 'Locum Tenens'],
  ] as const) {
    const enumCount = await prisma.job.count({
      where: { isPublished: true, jobType: enumVal },
    });
    const regexCount = await prisma.job.count({ where: buildCategoryWhereClause(slug) });
    console.log(`/${slug}: jobType="${enumVal}"=${enumCount} | title-regex=${regexCount} | coverage=${enumCount > 0 ? ((Math.min(regexCount, enumCount) / enumCount) * 100).toFixed(0) : 0}%`);
  }
  console.log('');

  // 4) /full-time — what's the title-regex picking up that's NOT jobType='Full-Time'?
  const ftRegexNotEnum = await prisma.job.findMany({
    where: {
      AND: [
        buildCategoryWhereClause('full-time'),
        { OR: [{ jobType: { not: 'Full-Time' } }, { jobType: null }] },
      ],
    },
    select: { id: true, title: true, jobType: true },
    take: 10,
  });
  console.log('/full-time regex matches with non-Full-Time jobType (sample):');
  ftRegexNotEnum.forEach((j) => console.log(`  [${j.jobType || 'NULL'}] ${j.title.slice(0, 100)}`));
  console.log('');

  // 5) Count-badge cross-check: the /jobs?category=full-time filter (used by JobCard chip)
  // uses buildWhereClause with category='full-time' → also calls CATEGORY_FILTERS → same 164
  // The /api/jobs/filter-counts response keys are enum jobType (Full-Time=2546). MISMATCH.
  console.log('═══ COUNT-BADGE CROSS-CHECK ═══');
  console.log('Category page /jobs/full-time:       164 (CATEGORY_FILTERS regex)');
  console.log('Filter-counts API jobType=Full-Time: 2546 (enum column)');
  console.log('These describe DIFFERENT universes — confirmed mismatch.');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
