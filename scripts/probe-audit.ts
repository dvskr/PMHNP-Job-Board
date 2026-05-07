/**
 * Step-5 (probe-at-insert) audit. Reads last-7d data from prod to answer:
 *   - How often is the ingest-time probe firing per source?
 *   - What probe reasons are blocking inserts?
 *   - Are any sources missing a native API probe (relying only on the
 *     generic HTTP HEAD/GET fallback)?
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

async function main() {
    const { prisma } = await import('@/lib/prisma');
    console.log('\n--- STEP 5 (PROBE-AT-INSERT) AUDIT — LAST 7d ---\n');

    // 1. dead_at_ingest counts by source
    const bySource = await prisma.$queryRawUnsafe<Array<{ source_provider: string; n: bigint }>>(`
    SELECT source_provider, COUNT(*)::bigint as n
    FROM rejected_jobs
    WHERE rejection_reason = 'dead_at_ingest'
      AND created_at > NOW() - INTERVAL '7 days'
    GROUP BY source_provider
    ORDER BY n DESC
  `);
    console.log('dead_at_ingest by source:');
    bySource.forEach((r) => console.log(`  ${r.source_provider}: ${r.n}`));
    console.log();

    // 2. probe reason distribution from raw_data
    const reasons = await prisma.$queryRawUnsafe<Array<{ reason: string; n: bigint }>>(`
    SELECT raw_data->>'probeReason' as reason, COUNT(*)::bigint as n
    FROM rejected_jobs
    WHERE rejection_reason = 'dead_at_ingest'
      AND created_at > NOW() - INTERVAL '7 days'
    GROUP BY raw_data->>'probeReason'
    ORDER BY n DESC
  `);
    console.log('probe reason distribution:');
    reasons.forEach((r) => console.log(`  ${r.reason || '(null)'}: ${r.n}`));
    console.log();

    // 3. dead_at_ingest as % of fetched (need source_stats for the denominator)
    const stats = await prisma.$queryRawUnsafe<Array<{ source: string; fetched: bigint; added: bigint; dup: bigint }>>(`
    SELECT
      source,
      SUM(jobs_fetched)::bigint as fetched,
      SUM(jobs_added)::bigint as added,
      SUM(jobs_duplicate)::bigint as dup
    FROM source_stats
    WHERE date > CURRENT_DATE - INTERVAL '7 days'
    GROUP BY source
    ORDER BY fetched DESC
  `);
    console.log('Last 7d source funnel (fetched / added / duplicate / dead_at_ingest):');
    const deadBySource = new Map(bySource.map((r) => [r.source_provider, Number(r.n)]));
    stats.forEach((s) => {
        const dead = deadBySource.get(s.source) ?? 0;
        const fetched = Number(s.fetched);
        const deadPct = fetched > 0 ? ((dead / fetched) * 100).toFixed(1) : '—';
        console.log(
            `  ${s.source.padEnd(20)} fetched=${String(s.fetched).padStart(6)} added=${String(s.added).padStart(4)} dup=${String(s.dup).padStart(5)} dead=${String(dead).padStart(4)} (${deadPct}% dead)`,
        );
    });
    console.log();

    // 4. Probe-system failures (caught/accepted) — these don't show in
    //    rejected_jobs because they're treated as "accept on probe failure".
    //    We check job_health_checks for inconclusive_* outcomes recorded
    //    around insert time.
    const inconclusiveCounts = await prisma.$queryRawUnsafe<Array<{ outcome: string; n: bigint }>>(`
    SELECT outcome, COUNT(*)::bigint as n
    FROM job_health_checks
    WHERE checked_at > NOW() - INTERVAL '7 days'
      AND outcome LIKE 'inconclusive_%'
    GROUP BY outcome
    ORDER BY n DESC
    LIMIT 10
  `);
    console.log('inconclusive_* probe outcomes (last 7d, all probes incl. dead-link cron):');
    inconclusiveCounts.forEach((r) => console.log(`  ${r.outcome}: ${r.n}`));
    console.log();

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
