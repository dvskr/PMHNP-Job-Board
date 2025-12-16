import { prisma } from '../lib/prisma';

async function checkJobStats() {
  try {
    console.log('📊 JOB AGGREGATION SYSTEM STATS\n');

    // Total jobs
    const total = await prisma.job.count();
    console.log(`Total Jobs: ${total}`);

    // Jobs by source provider
    console.log('\n📡 Jobs by Source Provider:');
    const bySource = await prisma.job.groupBy({
      by: ['sourceProvider'],
      _count: true,
      orderBy: {
        _count: {
          sourceProvider: 'desc',
        },
      },
    });
    bySource.forEach((source) => {
      console.log(`  ${source.sourceProvider || 'Unknown'}: ${source._count}`);
    });

    // Jobs created in last 7 days
    const last7Days = await prisma.job.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    });
    console.log(`\n📅 Jobs created in last 7 days: ${last7Days}`);

    // Expired jobs
    const expired = await prisma.job.count({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    console.log(`⏰ Expired jobs: ${expired}`);

    // Unpublished jobs
    const unpublished = await prisma.job.count({
      where: {
        isPublished: false,
      },
    });
    console.log(`❌ Unpublished jobs: ${unpublished}`);

    // Published jobs
    const published = await prisma.job.count({
      where: {
        isPublished: true,
      },
    });
    console.log(`✅ Published jobs: ${published}`);

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkJobStats();

