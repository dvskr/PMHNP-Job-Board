/**
 * Quick "what landed today" — counts new Job rows by source for the
 * current UTC day, plus the matching source_stats row if one exists.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

async function main() {
    const { prisma } = await import('@/lib/prisma');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    console.log(`\n--- JOBS LANDED TODAY (UTC ${today.toISOString().slice(0, 10)}) ---\n`);

    const bySource = await prisma.$queryRawUnsafe<Array<{ source: string; n: bigint }>>(`
    SELECT COALESCE(source_provider, '(none)') as source, COUNT(*)::bigint as n
    FROM jobs
    WHERE created_at >= $1
    GROUP BY source_provider
    ORDER BY n DESC
  `, today);

    if (bySource.length === 0) {
        console.log('No jobs added yet today.');
    } else {
        const total = bySource.reduce((s, r) => s + Number(r.n), 0);
        console.log(`source                  added (Job table createdAt >= today)`);
        for (const r of bySource) {
            console.log(`  ${r.source.padEnd(20)} ${String(r.n).padStart(5)}`);
        }
        console.log(`  ${'TOTAL'.padEnd(20)} ${String(total).padStart(5)}`);
    }

    // source_stats funnel for today (if cron has populated it)
    const stats = await prisma.sourceStats.findMany({
        where: { date: today },
        select: { source: true, jobsFetched: true, jobsAdded: true, jobsDuplicate: true, jobsRejected: true },
        orderBy: { jobsFetched: 'desc' },
    });
    if (stats.length > 0) {
        console.log(`\nsource_stats funnel (today):`);
        console.log(`source                 fetched  added  dup    rejected`);
        for (const s of stats) {
            console.log(
                `  ${s.source.padEnd(20)} ${String(s.jobsFetched).padStart(7)}  ${String(s.jobsAdded).padStart(5)}  ${String(s.jobsDuplicate).padStart(5)}  ${String(s.jobsRejected).padStart(8)}`,
            );
        }
    } else {
        console.log(`\n(no source_stats row for today yet — cron may not have fired)`);
    }

    await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
