/**
 * Same analysis as scripts/post-run-analysis.ts but reads .env.prod.
 * Use after a prod cron wave to inspect today's funnel.
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
    const { classifyRelevance } = await import('@/lib/utils/job-filter');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    console.log(`\n=== POST-RUN ANALYSIS (UTC ${today.toISOString().slice(0, 10)}, PROD DB) ===\n`);

    const funnel = await prisma.sourceStats.findMany({
        where: { date: today },
        orderBy: { jobsFetched: 'desc' },
    });

    if (funnel.length === 0) {
        console.log('No source_stats rows for today yet.');
        await prisma.$disconnect();
        return;
    }

    console.log('--- 1. PER-SOURCE FUNNEL (source_stats, today) ---');
    console.log('source                fetched   added   dup    rejected   avgQ');
    for (const r of funnel) {
        const q = r.avgQualityScore != null ? r.avgQualityScore.toFixed(0) : '-';
        console.log(
            `  ${r.source.padEnd(20)} ${String(r.jobsFetched).padStart(6)}  ${String(r.jobsAdded).padStart(5)}  ${String(r.jobsDuplicate).padStart(5)}  ${String(r.jobsRejected).padStart(8)}  ${q.padStart(4)}`,
        );
    }

    console.log('\n--- 2. REJECTION REASONS BY SOURCE (today) ---');
    const rej = await prisma.$queryRawUnsafe<Array<{ source: string; reason: string; n: bigint }>>(`
        SELECT source_provider as source, rejection_reason as reason, COUNT(*)::bigint as n
        FROM rejected_jobs
        WHERE created_at >= $1
        GROUP BY source_provider, rejection_reason
        ORDER BY source_provider, n DESC
    `, today);
    let curSource = '';
    for (const r of rej) {
        if (r.source !== curSource) {
            console.log(`\n  ${r.source}:`);
            curSource = r.source;
        }
        console.log(`    ${r.reason.padEnd(35)} ${String(r.n).padStart(5)}`);
    }

    console.log('\n--- 3. FIELD COMPLETENESS (jobs added today) ---');
    const sources = funnel.map((f) => f.source);
    for (const src of sources) {
        const stats = await prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(`
            SELECT COUNT(*)::bigint AS total,
                SUM(CASE WHEN description IS NOT NULL AND description <> '' THEN 1 ELSE 0 END)::bigint AS description,
                SUM(CASE WHEN city IS NOT NULL THEN 1 ELSE 0 END)::bigint AS city,
                SUM(CASE WHEN state IS NOT NULL THEN 1 ELSE 0 END)::bigint AS state,
                SUM(CASE WHEN min_salary IS NOT NULL THEN 1 ELSE 0 END)::bigint AS min_salary,
                SUM(CASE WHEN job_type IS NOT NULL THEN 1 ELSE 0 END)::bigint AS job_type,
                SUM(CASE WHEN mode IS NOT NULL THEN 1 ELSE 0 END)::bigint AS mode,
                SUM(CASE WHEN experience_level IS NOT NULL THEN 1 ELSE 0 END)::bigint AS exp_level,
                SUM(CASE WHEN slug IS NOT NULL THEN 1 ELSE 0 END)::bigint AS slug
            FROM jobs WHERE source_provider = $1 AND created_at >= $2
        `, src, today);
        const s = stats[0];
        if (!s) continue;
        const tot = Number(s.total);
        if (tot === 0) continue;
        const pct = (n: bigint) => ((Number(n) / tot) * 100).toFixed(0).padStart(3);
        console.log(`  ${src.padEnd(20)} (${tot} added)  desc:${pct(s.description)}%  state:${pct(s.state)}%  city:${pct(s.city)}%  minSal:${pct(s.min_salary)}%  mode:${pct(s.mode)}%  exp:${pct(s.exp_level)}%  type:${pct(s.job_type)}%`);
    }

    console.log('\n--- 4. originalPostedAt DISTRIBUTION (jobs added today) ---');
    for (const src of sources) {
        const buckets = await prisma.$queryRawUnsafe<Array<{ bucket: string; n: bigint }>>(`
            SELECT
                CASE
                    WHEN original_posted_at IS NULL THEN 'null'
                    WHEN original_posted_at >= NOW() - INTERVAL '1 day' THEN '<1d'
                    WHEN original_posted_at >= NOW() - INTERVAL '7 days' THEN '1-7d'
                    WHEN original_posted_at >= NOW() - INTERVAL '30 days' THEN '7-30d'
                    ELSE '>30d'
                END AS bucket,
                COUNT(*)::bigint AS n
            FROM jobs
            WHERE source_provider = $1 AND created_at >= $2
            GROUP BY bucket
            ORDER BY MIN(original_posted_at) DESC NULLS LAST
        `, src, today);
        if (buckets.length === 0) continue;
        const line = buckets.map((b) => `${b.bucket}=${b.n}`).join('  ');
        console.log(`  ${src.padEnd(20)} ${line}`);
    }

    console.log('\n--- 5. PMHNP RELEVANCE (jobs added today) ---');
    const addedToday = await prisma.job.findMany({
        where: { createdAt: { gte: today } },
        select: { sourceProvider: true, title: true, description: true, employer: true },
    });
    const relBySrc = new Map<string, { passes: number; reasons: Map<string, number> }>();
    for (const j of addedToday) {
        const src = j.sourceProvider ?? '(none)';
        const cur = relBySrc.get(src) ?? { passes: 0, reasons: new Map() };
        const r = classifyRelevance(j.title ?? '', j.description ?? '', j.employer ?? '');
        if (r.passes) cur.passes++;
        else cur.reasons.set(r.reason, (cur.reasons.get(r.reason) ?? 0) + 1);
        relBySrc.set(src, cur);
    }
    console.log('source                added   PMHNP-pass   non-PMHNP');
    for (const [src, c] of [...relBySrc.entries()].sort()) {
        const total = c.passes + [...c.reasons.values()].reduce((s, n) => s + n, 0);
        const reasonStr = [...c.reasons.entries()].map(([r, n]) => `${r}=${n}`).join(', ') || '—';
        console.log(`  ${src.padEnd(20)} ${String(total).padStart(5)}   ${String(c.passes).padStart(5)}        ${reasonStr}`);
    }

    console.log('\n--- 6. CRON RUN SUMMARY (today, ingest crons only) ---');
    const cronRuns = await prisma.cronRun.findMany({
        where: {
            name: 'ingest',
            startedAt: { gte: today },
        },
        select: { startedAt: true, finishedAt: true, success: true, durationMs: true, error: true, metrics: true },
        orderBy: { startedAt: 'asc' },
    });
    console.log(`  ${cronRuns.length} ingest cron firings · ${cronRuns.filter(r => r.success).length} succeeded · ${cronRuns.filter(r => !r.success).length} failed`);
    for (const r of cronRuns) {
        const ts = r.startedAt.toLocaleString('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: true });
        const status = r.success ? '✅' : '❌';
        const dur = r.durationMs ? `${(r.durationMs / 1000).toFixed(0)}s` : 'n/a';
        const m = (r.metrics as { totalAdded?: number; totalFetched?: number } | null) ?? null;
        const stats = m ? `+${m.totalAdded ?? 0} of ${m.totalFetched ?? 0} fetched` : '';
        console.log(`    ${status} ${ts} CT  ${dur.padStart(5)}  ${stats}${r.error ? '  err: ' + r.error.slice(0, 60) : ''}`);
    }

    await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
