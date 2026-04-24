import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function audit() {
  // Check what actual filters are in the page files
  const fs = await import('fs');
  
  // Check locum filter — 'travel' is overly broad
  console.log('\n═══ LOCUM-TENENS FILTER CHECK ═══');
  const travelCount = await prisma.job.count({
    where: { isPublished: true, title: { contains: 'travel', mode: 'insensitive' } }
  });
  const travelSample = await prisma.job.findMany({
    where: { isPublished: true, title: { contains: 'travel', mode: 'insensitive' } },
    take: 10, select: { title: true }
  });
  console.log(`"travel" matches: ${travelCount}`);
  travelSample.forEach((j: any) => console.log(`  • ${j.title}`));

  const locumCount = await prisma.job.count({
    where: { isPublished: true, title: { contains: 'locum', mode: 'insensitive' } }
  });
  console.log(`\n"locum" matches: ${locumCount}`);

  // Check addiction filter — 'MAT' and 'recovery' could be broad
  console.log('\n═══ ADDICTION FILTER CHECK ═══');
  const matCount = await prisma.job.count({
    where: { isPublished: true, title: { contains: 'MAT', mode: 'insensitive' } }
  });
  const matSample = await prisma.job.findMany({
    where: { isPublished: true, title: { contains: 'MAT', mode: 'insensitive' } },
    take: 10, select: { title: true }
  });
  console.log(`"MAT" matches: ${matCount}`);
  matSample.forEach((j: any) => console.log(`  • ${j.title}`));

  const recoverySample = await prisma.job.findMany({
    where: { isPublished: true, title: { contains: 'recovery', mode: 'insensitive' } },
    take: 10, select: { title: true }
  });
  console.log(`\n"recovery" matches: ${recoverySample.length}+`);
  recoverySample.forEach((j: any) => console.log(`  • ${j.title}`));

  // Check BH filter — 'behavioral' could match anything
  console.log('\n═══ BEHAVIORAL-HEALTH FILTER CHECK ═══');
  const bhSample = await prisma.job.findMany({
    where: { isPublished: true, title: { contains: 'behavioral', mode: 'insensitive' } },
    take: 10, select: { title: true }
  });
  console.log(`"behavioral" sample:`);
  bhSample.forEach((j: any) => console.log(`  • ${j.title}`));

  // Check correctional 'forensic' — could match non-correctional forensic
  console.log('\n═══ CORRECTIONAL FILTER CHECK ═══');
  const forensicSample = await prisma.job.findMany({
    where: { isPublished: true, title: { contains: 'forensic', mode: 'insensitive' } },
    take: 10, select: { title: true }
  });
  console.log(`"forensic" sample:`);
  forensicSample.forEach((j: any) => console.log(`  • ${j.title}`));

  // Total counts per category with current filters
  console.log('\n═══ TOTAL COUNTS ═══');
  const categories = ['locum', 'correctional', 'inpatient', 'behavioral health', 'addiction', '1099'];
  for (const term of categories) {
    const cnt = await prisma.job.count({
      where: { isPublished: true, title: { contains: term, mode: 'insensitive' } }
    });
    console.log(`"${term}" title match: ${cnt}`);
  }

  await pool.end();
}

audit().catch(e => { console.error(e); process.exit(1); });
