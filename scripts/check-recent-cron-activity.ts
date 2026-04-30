/**
 * Check whether the last fantastic-jobs-db trigger left any signal in
 * the database (audit rows, source_stats, or rejected_jobs).
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

    // Source stats — match any date row for this source (handles UTC midnight skew)
    const recentStats = await prisma.sourceStats.findMany({
        where: { source: 'fantastic-jobs-db' },
        orderBy: { updatedAt: 'desc' },
        take: 5,
    });
    console.log('Most-recent source_stats rows for fantastic-jobs-db:');
    for (const s of recentStats) {
        console.log(`  date=${s.date.toISOString().slice(0, 10)} updated=${s.updatedAt.toISOString()} fetched=${s.jobsFetched} added=${s.jobsAdded} dup=${s.jobsDuplicate}`);
    }
    console.log();

    // Rejected jobs from this source in the last hour
    const rej = await prisma.rejectedJob.count({
        where: {
            sourceProvider: 'fantastic-jobs-db',
            createdAt: { gte: hourAgo },
        },
    });
    console.log(`rejected_jobs from fantastic-jobs-db in last hour: ${rej}`);

    // Health-check audit rows (any source) in the last hour as activity proxy
    const audit = await prisma.jobHealthCheck.count({
        where: { checkedAt: { gte: hourAgo } },
    });
    console.log(`job_health_checks rows in last hour (any source): ${audit}`);

    // Last 5 jobs created across ALL sources to see if anything is flowing
    const lastJobs = await prisma.job.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { sourceProvider: true, title: true, createdAt: true },
    });
    console.log(`\nLast 5 created jobs (any source):`);
    for (const j of lastJobs) {
        console.log(`  ${j.createdAt.toISOString()}  [${j.sourceProvider ?? 'unknown'}] ${j.title.slice(0, 60)}`);
    }

    await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
