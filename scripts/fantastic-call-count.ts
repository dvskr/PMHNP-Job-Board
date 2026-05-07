/**
 * One-shot probe: run a single fantastic-jobs-db fetch (against the
 * production-shape 7d endpoint) and report the actual API call count.
 *
 * Doesn't write anything — pure measurement.
 */
import 'dotenv/config';

async function main() {
    const { fetchFantasticJobsDbJobs, getLastRunDiagnostics } = await import('@/lib/aggregators/fantastic-jobs-db');

    const start = Date.now();
    console.log('Running fantastic-jobs-db 7d fetch (this is what the cron does, twice a day)...\n');
    const jobs = await fetchFantasticJobsDbJobs({ endpoint: '7d' });
    const elapsed = (Date.now() - start) / 1000;
    const diag = getLastRunDiagnostics();

    console.log(`\n--- RESULT ---`);
    console.log(`Jobs returned:           ${jobs.length}`);
    console.log(`API calls used this run: ${diag.apiCallsUsed}`);
    console.log(`Quota remaining (month): ${diag.rateLimitRemaining ?? 'n/a'}`);
    console.log(`Elapsed:                 ${elapsed.toFixed(1)}s`);
    console.log();
    console.log(`Cron schedule: 2 runs/day (30 11,17 * * *) + annual 6m backfill`);
    console.log(`At ${diag.apiCallsUsed} calls/run × 2 runs/day:`);
    const perDay = (diag.apiCallsUsed ?? 0) * 2;
    const perWeek = perDay * 7;
    const perMonth = Math.round(perDay * 30);
    console.log(`  ≈ ${perDay} calls/day`);
    console.log(`  ≈ ${perWeek} calls/week`);
    console.log(`  ≈ ${perMonth} calls/month`);
    console.log(`  RapidAPI Ultra cap: 20,000/month → ${((perMonth / 20000) * 100).toFixed(0)}% utilization`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
