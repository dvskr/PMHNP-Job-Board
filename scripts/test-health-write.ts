/**
 * Test write to job_health_checks — find out why production audit table is empty.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';

async function main(): Promise<void> {
    // 1. Find a real published job to attach the row to.
    const someJob = await prisma.job.findFirst({
        where: { isPublished: true },
        select: { id: true, title: true },
    });
    if (!someJob) {
        console.error('No published jobs found.');
        process.exit(1);
    }
    console.log(`Anchor job: ${someJob.id} (${someJob.title})\n`);

    // 2. Check current table-level row count + partition existence via raw SQL.
    console.log('Partition table existence:');
    const partitions = await prisma.$queryRaw<{ relname: string; n_live_tup: bigint }[]>`
        SELECT c.relname, s.n_live_tup
        FROM pg_class c
        JOIN pg_stat_user_tables s ON s.relid = c.oid
        WHERE c.relname LIKE 'job_health_checks%'
        ORDER BY c.relname;
    `;
    for (const p of partitions) {
        console.log(`  ${p.relname.padEnd(40)} live_rows=${Number(p.n_live_tup)}`);
    }
    console.log();

    // 3. Try a direct prisma insert and let any error propagate.
    console.log('Attempting prisma.jobHealthCheck.createMany insert...');
    try {
        const result = await prisma.jobHealthCheck.createMany({
            data: [{
                jobId: someJob.id,
                checkType: 'http_probe',
                outcome: 'alive_2xx',
                alive: true,
                httpStatus: 200,
                checkerVersion: 'diagnose-test-v1',
            }],
        });
        console.log(`  ✓ Insert succeeded: ${result.count} row(s) created\n`);
    } catch (err) {
        console.error('  ✗ Insert FAILED:');
        console.error(`    ${err instanceof Error ? err.message : String(err)}`);
        if (err instanceof Error && err.stack) {
            console.error(`    Stack: ${err.stack.split('\n').slice(0, 5).join('\n      ')}`);
        }
    }

    // 4. Re-count.
    const totalAfter = await prisma.jobHealthCheck.count();
    console.log(`Total rows after test: ${totalAfter}`);

    // 5. Cleanup our test row.
    if (totalAfter > 0) {
        await prisma.jobHealthCheck.deleteMany({
            where: { checkerVersion: 'diagnose-test-v1' },
        });
        console.log('Test row(s) deleted.');
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Test failed at top level:', err);
    await prisma.$disconnect();
    process.exit(1);
});
