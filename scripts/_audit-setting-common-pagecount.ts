import { prisma } from '@/lib/prisma';
import { buildCategoryWhereClause } from '@/lib/filters';

export async function run(): Promise<void> {
  const cases: Array<{ slug: string; extra?: Record<string, unknown> }> = [
    { slug: 'inpatient', extra: { isRemote: { not: true } } },
    { slug: 'hospital' },
    { slug: 'private-practice' },
    { slug: 'crisis' },
    { slug: 'behavioral-health' },
  ];

  console.log('slug              page-count   raw-filter-count');
  for (const c of cases) {
    const pageCount = await prisma.job.count({ where: buildCategoryWhereClause(c.slug, c.extra ?? {}) });
    const rawCount = await prisma.job.count({ where: buildCategoryWhereClause(c.slug) });
    console.log(`${c.slug.padEnd(18)} ${String(pageCount).padStart(5)}        ${rawCount}`);
  }
  await prisma.$disconnect();
}
