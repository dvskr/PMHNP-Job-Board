const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function audit() {
  const filters = {
    'locum-tenens': {
      isPublished: true,
      OR: [
        { title: { contains: 'locum', mode: 'insensitive' } },
        { title: { contains: 'locums', mode: 'insensitive' } },
        { title: { contains: 'travel', mode: 'insensitive' } },
        { title: { contains: 'temporary assignment', mode: 'insensitive' } },
        { description: { contains: 'locum tenens', mode: 'insensitive' } },
      ],
    },
    'correctional': {
      isPublished: true,
      OR: [
        { title: { contains: 'correctional', mode: 'insensitive' } },
        { title: { contains: 'corrections', mode: 'insensitive' } },
        { title: { contains: 'prison', mode: 'insensitive' } },
        { title: { contains: 'forensic', mode: 'insensitive' } },
        { title: { contains: 'jail', mode: 'insensitive' } },
        { title: { contains: 'detention', mode: 'insensitive' } },
        { title: { contains: 'incarcerated', mode: 'insensitive' } },
      ],
    },
    'addiction': {
      isPublished: true,
      OR: [
        { title: { contains: 'addiction', mode: 'insensitive' } },
        { title: { contains: 'substance abuse', mode: 'insensitive' } },
        { title: { contains: 'substance use', mode: 'insensitive' } },
        { title: { contains: 'SUD', mode: 'insensitive' } },
        { title: { contains: 'MAT', mode: 'insensitive' } },
        { title: { contains: 'opioid', mode: 'insensitive' } },
        { title: { contains: 'recovery', mode: 'insensitive' } },
        { title: { contains: 'detox', mode: 'insensitive' } },
      ],
    },
    'behavioral-health': {
      isPublished: true,
      OR: [
        { title: { contains: 'behavioral health', mode: 'insensitive' } },
        { title: { contains: 'behavioral', mode: 'insensitive' } },
        { title: { contains: 'mental health', mode: 'insensitive' } },
      ],
    },
    '1099': {
      isPublished: true,
      isRemote: { not: true },
      OR: [
        { title: { contains: '1099', mode: 'insensitive' } },
        { title: { contains: 'independent contractor', mode: 'insensitive' } },
      ],
    },
    'inpatient': {
      isPublished: true,
      isRemote: { not: true },
      OR: [
        { title: { contains: 'inpatient', mode: 'insensitive' } },
        { title: { contains: 'in-patient', mode: 'insensitive' } },
        { title: { contains: 'acute care', mode: 'insensitive' } },
        { title: { contains: 'hospital', mode: 'insensitive' } },
      ],
    },
  };

  for (const [cat, where] of Object.entries(filters)) {
    const count = await prisma.job.count({ where });
    const sample = await prisma.job.findMany({
      where, take: 5, orderBy: { createdAt: 'desc' },
      select: { title: true, employer: true }
    });
    console.log(`\n═══ ${cat.toUpperCase()} (${count} jobs) ═══`);
    sample.forEach(j => console.log(`  • ${j.title} — ${j.employer}`));
  }

  await prisma.$disconnect();
}

audit().catch(e => { console.error(e); process.exit(1); });
