/**
 * Check whether cleanup-expired actually wrote audit rows since the
 * G1 deploy at 2026-05-07 00:01 CT (= 05:01 UTC).
 */
import { config } from 'dotenv';
config({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;

async function main() {
    const m = await import('@/lib/prisma');
    const deployTime = new Date('2026-05-07T05:01:00Z');

    console.log(`\n=== EXPIRY AUDIT TRAIL CHECK (since G1 deploy ${deployTime.toISOString()}) ===\n`);

    // 1. All audit outcomes since deploy
    const audit = await m.prisma.$queryRawUnsafe<Array<{ check_type: string; outcome: string; n: bigint }>>(`
        SELECT check_type, outcome, COUNT(*)::bigint AS n
        FROM job_health_checks
        WHERE checked_at >= $1 AND alive = false
        GROUP BY check_type, outcome
        ORDER BY n DESC
    `, deployTime);
    console.log('Audit rows (alive=false) since deploy:');
    for (const r of audit) {
        console.log(`  ${r.check_type.padEnd(22)} ${r.outcome.padEnd(28)} ${String(r.n).padStart(6)}`);
    }
    if (audit.length === 0) console.log('  (none)');

    // 2. Currently-unpublished jobs whose updatedAt is after deploy
    const flipped = await m.prisma.job.count({
        where: { isPublished: false, updatedAt: { gte: deployTime } },
    });
    console.log(`\nJobs flipped to unpublished since deploy: ${flipped}`);

    // 3. Specifically: jobs with expiresAt in the past, currently unpublished, updated since deploy
    const expiryFlipped = await m.prisma.job.count({
        where: {
            isPublished: false,
            updatedAt: { gte: deployTime },
            expiresAt: { lt: new Date() },
        },
    });
    console.log(`  ...of which expiresAt < NOW(): ${expiryFlipped}`);

    // 4. Cleanup-expired cron NOT in cron_runs because its route doesn't
    //    use withCronTracking. So we can't see if/when it fired. But we
    //    can see how many jobs SHOULD have been caught:
    const stillPublishedExpired = await m.prisma.job.count({
        where: { isPublished: true, expiresAt: { lt: new Date() } },
    });
    console.log(`\nPublished AND expiresAt < NOW() (should be 0 if cleanup-expired ran):  ${stillPublishedExpired}`);

    // 5. Sanity: how many published jobs have null expiresAt (legacy)
    const nullExpires = await m.prisma.job.count({ where: { isPublished: true, expiresAt: null } });
    console.log(`Published with NULL expiresAt (cleanup-expired won't catch these): ${nullExpires}`);

    await m.prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
