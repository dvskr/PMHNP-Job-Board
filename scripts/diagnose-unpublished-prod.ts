/**
 * Diagnose why ~3000 jobs disappeared in the last 24h.
 * Cross-references cron_runs (what ran) with job_health_checks (audit
 * trail of unpublishes) and the jobs.updated_at recent-flip set.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) {
    process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
}

async function main() {
    const { prisma } = await import('@/lib/prisma');

    const since = new Date(Date.now() - 36 * 60 * 60 * 1000); // last 36h to be safe
    console.log(`\n=== UNPUBLISH DIAGNOSIS (since ${since.toISOString()}) ===\n`);

    // 1. Current state
    const total = await prisma.job.count();
    const published = await prisma.job.count({ where: { isPublished: true } });
    const unpublished = await prisma.job.count({ where: { isPublished: false } });
    console.log('--- 1. CURRENT STATE ---');
    console.log(`  total rows:       ${total}`);
    console.log(`  published:        ${published}`);
    console.log(`  unpublished:      ${unpublished}`);

    // 2. Recently-flipped (updated in last 36h, currently unpublished)
    const recentlyUnpub = await prisma.job.count({
        where: { isPublished: false, updatedAt: { gte: since } },
    });
    console.log(`  flipped in 36h:   ${recentlyUnpub}`);

    // 3. cron_runs in window — which crons could have unpublished
    console.log('\n--- 2. CRON FIRINGS (last 36h, name contains key words) ---');
    const crons = await prisma.cronRun.findMany({
        where: {
            startedAt: { gte: since },
            OR: [
                { name: 'cleanup-expired' },
                { name: 'check-dead-links' },
                { name: 'source-presence-unpublish' },
                { name: 'engagement-anomaly' },
                { name: 'ingest' },
            ],
        },
        orderBy: { startedAt: 'asc' },
        select: { name: true, startedAt: true, success: true, durationMs: true, metrics: true, error: true },
    });
    const cronAgg = new Map<string, { runs: number; failed: number; metrics: Array<unknown> }>();
    for (const c of crons) {
        const cur = cronAgg.get(c.name) ?? { runs: 0, failed: 0, metrics: [] };
        cur.runs++;
        if (!c.success) cur.failed++;
        if (c.metrics) cur.metrics.push(c.metrics);
        cronAgg.set(c.name, cur);
    }
    for (const [name, agg] of cronAgg.entries()) {
        console.log(`  ${name.padEnd(30)} runs:${agg.runs}  failed:${agg.failed}`);
        for (const m of agg.metrics.slice(0, 5)) {
            console.log(`    metrics: ${JSON.stringify(m).slice(0, 200)}`);
        }
    }

    // 4. job_health_checks audit trail in window — definitive answer
    console.log('\n--- 3. job_health_checks AUDIT (last 36h, alive=false) ---');
    const audit = await prisma.$queryRawUnsafe<Array<{ check_type: string; outcome: string; n: bigint }>>(`
        SELECT check_type, outcome, COUNT(*)::bigint AS n
        FROM job_health_checks
        WHERE checked_at >= $1 AND alive = false
        GROUP BY check_type, outcome
        ORDER BY n DESC
    `, since);
    if (audit.length === 0) {
        console.log('  (no audit rows for unpublishes in window)');
    } else {
        console.log('  check_type            outcome                      count');
        for (const r of audit) {
            console.log(`  ${r.check_type.padEnd(22)} ${r.outcome.padEnd(28)} ${String(r.n).padStart(6)}`);
        }
    }

    // 5. Per-source breakdown of recent unpublishes (jobs.updated_at-based)
    console.log('\n--- 4. RECENTLY-UNPUBLISHED BY SOURCE (jobs.updated_at in window) ---');
    const bySource = await prisma.$queryRawUnsafe<Array<{ source: string; n: bigint }>>(`
        SELECT COALESCE(source_provider, '(none)') AS source, COUNT(*)::bigint AS n
        FROM jobs
        WHERE is_published = false AND updated_at >= $1
        GROUP BY source_provider
        ORDER BY n DESC
    `, since);
    for (const r of bySource) {
        console.log(`  ${r.source.padEnd(20)} ${String(r.n).padStart(6)}`);
    }

    // 6. Reason distribution from updated_at + expiresAt comparison
    console.log('\n--- 5. WHY UNPUBLISHED (heuristic) ---');
    const heuristic = await prisma.$queryRawUnsafe<Array<{ reason: string; n: bigint }>>(`
        SELECT
            CASE
                WHEN expires_at IS NOT NULL AND expires_at < NOW() THEN 'expiry (expiresAt past)'
                WHEN health_consecutive_missing >= 3 THEN 'orphan (presence ≥3 misses)'
                WHEN expires_at IS NULL THEN 'no expiresAt (manual / legacy)'
                ELSE 'dead-link or other'
            END AS reason,
            COUNT(*)::bigint AS n
        FROM jobs
        WHERE is_published = false AND updated_at >= $1
        GROUP BY 1
        ORDER BY n DESC
    `, since);
    for (const r of heuristic) {
        console.log(`  ${r.reason.padEnd(40)} ${String(r.n).padStart(6)}`);
    }

    await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
