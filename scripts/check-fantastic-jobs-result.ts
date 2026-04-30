/**
 * Quick verification of the latest fantastic-jobs-db ingest run.
 * Looks at recent inserts + source_stats for the day.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
import { prisma } from '@/lib/prisma';

async function main(): Promise<void> {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Recent inserts in the last hour from fantastic-jobs-db
    const recentAdds = await prisma.job.count({
        where: {
            sourceProvider: 'fantastic-jobs-db',
            createdAt: { gte: hourAgo },
        },
    });
    const last24h = await prisma.job.count({
        where: {
            sourceProvider: 'fantastic-jobs-db',
            createdAt: { gte: dayAgo },
        },
    });

    console.log(`Fantastic-Jobs-DB inserts:`);
    console.log(`  last 1 hour:  ${recentAdds}`);
    console.log(`  last 24 hours: ${last24h}`);

    // Source stats for today
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStats = await prisma.sourceStats.findFirst({
        where: { source: 'fantastic-jobs-db', date: today },
    });
    if (todayStats) {
        console.log(`\nsource_stats today:`);
        console.log(`  fetched: ${todayStats.jobsFetched}`);
        console.log(`  added:   ${todayStats.jobsAdded}`);
        console.log(`  duplicate: ${todayStats.jobsDuplicate}`);
        console.log(`  rate:    ${todayStats.jobsFetched > 0 ? ((todayStats.jobsAdded / todayStats.jobsFetched) * 100).toFixed(2) : '0'}%`);
    } else {
        console.log(`\nNo source_stats row for today yet (might still be writing).`);
    }

    // Last 7 days for comparison
    const sevenDays = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last7dStats = await prisma.sourceStats.findMany({
        where: { source: 'fantastic-jobs-db', date: { gte: sevenDays } },
        orderBy: { date: 'desc' },
    });
    console.log(`\nLast 7 days of source_stats:`);
    console.log('  date         fetched  added  duplicate  rate');
    for (const s of last7dStats) {
        const rate = s.jobsFetched > 0 ? ((s.jobsAdded / s.jobsFetched) * 100).toFixed(2) : '0';
        console.log(`  ${s.date.toISOString().slice(0, 10)}  ${s.jobsFetched.toString().padStart(7)}  ${s.jobsAdded.toString().padStart(5)}  ${s.jobsDuplicate.toString().padStart(9)}  ${rate}%`);
    }

    // Sample of newest fantastic-jobs from this hour
    const sample = await prisma.job.findMany({
        where: {
            sourceProvider: 'fantastic-jobs-db',
            createdAt: { gte: hourAgo },
        },
        select: { title: true, employer: true, sourceSite: true, qualityScore: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
    });
    if (sample.length > 0) {
        console.log(`\nSample of newest inserts:`);
        for (const j of sample) {
            console.log(`  [Q${j.qualityScore.toString().padStart(2)}] ${j.title}  @ ${j.employer}  (ats=${j.sourceSite ?? 'unknown'})`);
        }
    }

    await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
