import { prisma } from '../lib/prisma';
import { CATEGORY_FILTERS } from '../lib/filters';

async function run() {
  const count = await prisma.job.count({ where: { isPublished: true, OR: CATEGORY_FILTERS['travel'] } });
  console.log(`Travel jobs: ${count}`);
  await prisma.$disconnect();
}
run();
