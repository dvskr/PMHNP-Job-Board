/**
 * Recompute Company.jobCount from the actual count of linked jobs.
 *
 * The counter is bumped on every getOrCreateCompany() call but NEVER
 * decremented when jobs are unpublished / expired / merged via dedup —
 * so it drifts upward indefinitely. Audit 2026-05-06 showed LifeStance
 * tracked=15,702 vs actual=6,295 (a 2.5x inflation).
 *
 * Run periodically (or wrap as a cron) to keep the counter honest.
 *
 * Usage:
 *   npx tsx scripts/companies-recompute-jobcount.ts            # dry run
 *   npx tsx scripts/companies-recompute-jobcount.ts --execute  # apply
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

const DRY_RUN = !process.argv.includes('--execute');

async function main() {
    const { prisma } = await import('@/lib/prisma');

    console.log(`\n--- COMPANY jobCount RECOMPUTE (${DRY_RUN ? 'DRY RUN' : 'EXECUTING'}) ---\n`);

    // Sample the drift first
    const driftSummary = await prisma.$queryRawUnsafe<Array<{ inflated: bigint; deflated: bigint; matched: bigint }>>(`
    WITH actual AS (
      SELECT c.id, c.job_count as tracked, COUNT(j.id)::int as real_count
      FROM companies c
      LEFT JOIN jobs j ON j.company_id = c.id
      GROUP BY c.id, c.job_count
    )
    SELECT
      SUM(CASE WHEN tracked > real_count THEN 1 ELSE 0 END)::bigint as inflated,
      SUM(CASE WHEN tracked < real_count THEN 1 ELSE 0 END)::bigint as deflated,
      SUM(CASE WHEN tracked = real_count THEN 1 ELSE 0 END)::bigint as matched
    FROM actual
  `);
    const s = driftSummary[0]!;
    console.log(`Companies inflated  (tracked > actual): ${s.inflated}`);
    console.log(`Companies deflated  (tracked < actual): ${s.deflated}`);
    console.log(`Companies in sync   (tracked = actual): ${s.matched}`);

    if (DRY_RUN) {
        console.log('\nDRY RUN — no changes. Re-run with `--execute`.');
        await prisma.$disconnect();
        return;
    }

    console.log('\nRecomputing in a single SQL pass...');
    const result = await prisma.$executeRawUnsafe(`
    UPDATE companies c
    SET job_count = sub.real_count
    FROM (
      SELECT c2.id, COUNT(j.id)::int as real_count
      FROM companies c2
      LEFT JOIN jobs j ON j.company_id = c2.id
      GROUP BY c2.id
    ) sub
    WHERE c.id = sub.id AND c.job_count <> sub.real_count
  `);
    console.log(`✅ Updated ${result} Company rows`);

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
