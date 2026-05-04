/**
 * Diagnostic: confirm what's actually live in prod for the GSC remediation.
 * Read-only — no writes.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env' });
dotenvConfig({ path: '.env.prod' });

async function main() {
    const { prisma } = await import('@/lib/prisma');

    console.log('=== Production state check ===\n');

    // 1. Which Prisma migrations have been applied?
    try {
        const migrations: Array<{ migration_name: string; finished_at: Date | null }> = await prisma.$queryRaw`
            SELECT migration_name, finished_at
            FROM _prisma_migrations
            WHERE migration_name LIKE '20260504%'
               OR migration_name LIKE '%deindex%'
               OR migration_name LIKE '%gsc%'
               OR migration_name LIKE '%cron_run%'
               OR migration_name LIKE '%pseo_snippet%'
            ORDER BY finished_at DESC
        `;
        console.log('Recent migrations (May 4 + GSC-related):');
        if (migrations.length === 0) {
            console.log('  (none found — migrations may not be applied yet)');
        } else {
            for (const m of migrations) {
                const status = m.finished_at ? `✓ ${m.finished_at.toISOString().slice(0, 16)}` : '⚠ not finished';
                console.log(`  ${status}  ${m.migration_name}`);
            }
        }
    } catch (err) {
        console.log(`  ✗ Migration query failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    console.log();

    // 2. Do the new tables exist?
    const tables = ['deindex_queue', 'gsc_snapshots', 'cron_runs', 'city_snippets', 'category_city_snippets'];
    console.log('New tables:');
    for (const t of tables) {
        try {
            const r: Array<{ exists: boolean }> = await prisma.$queryRawUnsafe(
                `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '${t}') AS exists`
            );
            const exists = r[0]?.exists;
            console.log(`  ${exists ? '✓' : '✗'} ${t}`);
        } catch (err) {
            console.log(`  ✗ ${t} — ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    console.log();

    // 3. Row counts in each new table
    console.log('Row counts:');
    try { console.log(`  deindex_queue:           ${await prisma.deindexQueue.count()}`); } catch { console.log(`  deindex_queue:           (table missing)`); }
    try { console.log(`  gsc_snapshots:           ${await prisma.gscSnapshot.count()}`); } catch { console.log(`  gsc_snapshots:           (table missing)`); }
    try { console.log(`  cron_runs:               ${await prisma.cronRun.count()}`); } catch { console.log(`  cron_runs:               (table missing)`); }
    try { console.log(`  city_snippets:           ${await prisma.citySnippet.count()}`); } catch { console.log(`  city_snippets:           (table missing)`); }
    try { console.log(`  category_city_snippets:  ${await prisma.categoryCitySnippet.count()}`); } catch { console.log(`  category_city_snippets:  (table missing)`); }
    try { console.log(`  pseoStats:               ${await prisma.pseoStats.count()}`); } catch { /* skip */ }

    console.log();

    // 4. Deindex queue breakdown if populated
    try {
        const dq = await prisma.deindexQueue.groupBy({
            by: ['status'],
            _count: { _all: true },
        });
        if (dq.length > 0) {
            console.log('deindex_queue by status:');
            for (const r of dq) console.log(`  ${r.status.padEnd(12)} ${r._count._all}`);
        }
    } catch { /* skip */ }

    // 5. pseoStats sanity (P1.5 internal links depend on this)
    try {
        const stateCount = await prisma.pseoStats.count({
            where: { type: 'setting-state', totalJobs: { gte: 1 } },
        });
        const cityCount = await prisma.pseoStats.count({
            where: { type: 'category-city', totalJobs: { gte: 1 } },
        });
        console.log(`\npseoStats coverage:`);
        console.log(`  setting-state with ≥1 job:  ${stateCount}`);
        console.log(`  category-city with ≥1 job:  ${cityCount}`);
        if (stateCount === 0 && cityCount === 0) {
            console.log(`  ⚠ aggregate-pseo cron has not run yet — internal links on pSEO pages will be hidden`);
        }
    } catch { /* skip */ }
}

main()
    .catch((err) => { console.error(err); process.exit(1); })
    .finally(async () => {
        const { prisma } = await import('@/lib/prisma');
        await prisma.$disconnect();
    });
