/**
 * Section-5 audit: actual size + retention behavior of every table the
 * ingest pipeline writes to. Cross-checks against the doc's table.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

async function main() {
    const { prisma } = await import('@/lib/prisma');

    console.log('\n--- SECTION 5 — INGEST DB TABLES ---\n');

    const tables = [
        ['jobs', 'jobs'],
        ['rejected_jobs', 'rejected_jobs'],
        ['job_health_checks', 'job_health_checks'],
        ['source_stats', 'source_stats'],
        ['companies', 'companies'],
        ['employer_jobs', 'employer_jobs'],
        ['cron_runs', 'cron_runs'],
        ['employer_leads', 'employer_leads'],
    ] as const;

    for (const [label, table] of tables) {
        try {
            const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT COUNT(*)::bigint as n FROM ${table}`);
            const total = Number(rows[0]?.n ?? 0);

            // Try to read date range from a "created_at" or equivalent col
            let oldest: Date | null = null;
            let newest: Date | null = null;
            try {
                const r = await prisma.$queryRawUnsafe<Array<{ oldest: Date | null; newest: Date | null }>>(`
          SELECT MIN(created_at) as oldest, MAX(created_at) as newest FROM ${table}
        `);
                oldest = r[0]?.oldest ?? null;
                newest = r[0]?.newest ?? null;
            } catch {
                // table may not have created_at — that's fine
            }

            console.log(
                `${label.padEnd(20)} ${String(total).padStart(8)} rows | ` +
                (oldest ? `oldest ${oldest.toISOString().slice(0, 10)} → newest ${newest?.toISOString().slice(0, 10)}` : 'no created_at'),
            );
        } catch (e) {
            console.log(`${label.padEnd(20)} ERROR: ${(e as Error).message}`);
        }
    }

    // Last 7d additions (where applicable) for growth signal
    console.log('\nLast-7d row additions:');
    for (const [label, table] of tables) {
        try {
            const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`
        SELECT COUNT(*)::bigint as n FROM ${table} WHERE created_at > NOW() - INTERVAL '7 days'
      `);
            console.log(`  ${label.padEnd(20)} +${rows[0]?.n}/7d`);
        } catch {
            console.log(`  ${label.padEnd(20)} (no created_at)`);
        }
    }

    // Specifically: cron_runs population (Step 10 fix should have started filling it)
    console.log('\ncron_runs by name (if any):');
    try {
        const cronRuns = await prisma.$queryRawUnsafe<Array<{ name: string; n: bigint; last_run: Date }>>(`
      SELECT name, COUNT(*)::bigint as n, MAX(started_at) as last_run
      FROM cron_runs
      GROUP BY name
      ORDER BY n DESC
    `);
        if (cronRuns.length === 0) console.log('  (empty — wrap hasn\'t shipped yet, or no run since)');
        for (const r of cronRuns) {
            console.log(`  ${r.name.padEnd(30)} ${String(r.n).padStart(5)} runs, last ${r.last_run?.toISOString().slice(0, 16) ?? '-'}`);
        }
    } catch (e) {
        console.log('  ERROR:', (e as Error).message);
    }

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
