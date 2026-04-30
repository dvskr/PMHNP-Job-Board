/**
 * Diagnose what the job-health pipeline is actually writing to prod.
 *
 * Read-only triage script — no writes.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';

async function main(): Promise<void> {
    const total = await prisma.jobHealthCheck.count();
    console.log(`Total job_health_checks rows: ${total}\n`);

    if (total === 0) {
        console.log('Audit table is empty. Possible causes:');
        console.log('  1. Migrations applied to prod but no code path writes (recorder not called)');
        console.log('  2. Cron jobs not firing');
        console.log('  3. Dead-link cron writes errored silently\n');

        const lastDeadLink = await prisma.job.findFirst({
            where: { lastLinkCheckedAt: { not: null } },
            orderBy: { lastLinkCheckedAt: 'desc' },
            select: { lastLinkCheckedAt: true, title: true },
        });
        console.log(`Most recent lastLinkCheckedAt: ${lastDeadLink?.lastLinkCheckedAt?.toISOString() ?? 'NONE'}`);
        console.log(`  → ${lastDeadLink?.title}\n`);
        await prisma.$disconnect();
        return;
    }

    console.log('Counts by check_type:');
    const byType = await prisma.jobHealthCheck.groupBy({
        by: ['checkType'],
        _count: { _all: true },
    });
    for (const t of byType) {
        console.log(`  ${t.checkType.padEnd(20)} ${t._count._all}`);
    }
    console.log();

    console.log('Counts by outcome:');
    const byOutcome = await prisma.jobHealthCheck.groupBy({
        by: ['outcome'],
        _count: { _all: true },
    });
    for (const o of byOutcome.sort((a, b) => b._count._all - a._count._all)) {
        console.log(`  ${o.outcome.padEnd(30)} ${o._count._all}`);
    }
    console.log();

    const earliest = await prisma.jobHealthCheck.findFirst({
        orderBy: { checkedAt: 'asc' },
        select: { checkedAt: true },
    });
    const latest = await prisma.jobHealthCheck.findFirst({
        orderBy: { checkedAt: 'desc' },
        select: { checkedAt: true },
    });
    console.log(`Time range: ${earliest?.checkedAt.toISOString()} → ${latest?.checkedAt.toISOString()}\n`);

    console.log('Last 5 rows of any kind:');
    const recent = await prisma.jobHealthCheck.findMany({
        orderBy: { checkedAt: 'desc' },
        take: 5,
        select: {
            checkedAt: true,
            checkType: true,
            outcome: true,
            httpStatus: true,
            jobId: true,
            errorKind: true,
        },
    });
    for (const r of recent) {
        console.log(
            `  ${r.checkedAt.toISOString()}  ${r.checkType.padEnd(18)}  ${r.outcome.padEnd(25)}  http=${r.httpStatus ?? '-'}  err=${r.errorKind ?? '-'}`,
        );
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Diagnostic failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
