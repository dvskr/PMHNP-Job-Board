/**
 * Deep audit: is the Companies table truly dup-heavy, or just long-tail
 * (one-job employers from a long-running ingest)?
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

async function main() {
    const { prisma } = await import('@/lib/prisma');

    console.log('\n--- COMPANIES DEEP AUDIT ---\n');

    const total = await prisma.company.count();
    const zeroJob = await prisma.company.count({ where: { jobCount: 0 } });
    const oneJob = await prisma.company.count({ where: { jobCount: 1 } });
    const multi = await prisma.company.count({ where: { jobCount: { gt: 1 } } });

    console.log(`Total Companies:           ${total}`);
    console.log(`  with jobCount = 0:       ${zeroJob}`);
    console.log(`  with jobCount = 1:       ${oneJob}`);
    console.log(`  with jobCount > 1:       ${multi}`);
    console.log();

    // jobCount on Company row vs actual count of linked jobs (drift?)
    const driftSample = await prisma.$queryRawUnsafe<Array<{
        id: string; name: string; tracked: number; actual: bigint;
    }>>(`
    SELECT c.id, c.name, c.job_count as tracked,
           COUNT(j.id)::bigint as actual
    FROM companies c
    LEFT JOIN jobs j ON j.company_id = c.id
    GROUP BY c.id, c.name, c.job_count
    HAVING c.job_count <> COUNT(j.id)
    ORDER BY ABS(c.job_count - COUNT(j.id)::int) DESC
    LIMIT 10
  `);
    console.log(`jobCount drift (top 10 mismatches):`);
    for (const d of driftSample) {
        console.log(`  ${d.name.padEnd(40)} tracked=${d.tracked} actual=${d.actual}`);
    }
    console.log();

    // Companies whose linked jobs are ALL unpublished (probably stale cruft)
    const allUnpublished = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`
    SELECT COUNT(*)::bigint as n FROM companies c
    WHERE NOT EXISTS (
      SELECT 1 FROM jobs j WHERE j.company_id = c.id AND j.is_published = true
    )
  `);
    console.log(`Companies with NO published jobs: ${allUnpublished[0]?.n}`);
    console.log();

    // Soft-similarity sniff: any normalizedName collisions on a coarser key?
    const collisions = await prisma.$queryRawUnsafe<Array<{ key: string; n: bigint; names: string }>>(`
    SELECT
      LEFT(REGEXP_REPLACE(LOWER(name), '[^a-z0-9]', '', 'g'), 15) as key,
      COUNT(*)::bigint as n,
      STRING_AGG(name, ' | ') as names
    FROM companies
    GROUP BY key
    HAVING COUNT(*) > 1
    ORDER BY n DESC
    LIMIT 15
  `);
    console.log('Soft-similarity collisions (first-15-alphanumeric-chars):');
    for (const c of collisions) {
        console.log(`  ${c.n}× | ${c.key.padEnd(15)} | ${c.names.slice(0, 100)}`);
    }

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
