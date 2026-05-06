/**
 * Smoke test for the new ats-jobs-db adapter — calls the live endpoint
 * with a small page_size and reports response shape + first record.
 * Read-only, no DB writes.
 */
import 'dotenv/config';

async function main() {
    const { fetchAtsJobsDbJobs, getLastRunDiagnostics } = await import('@/lib/aggregators/ats-jobs-db');
    const start = Date.now();
    const jobs = await fetchAtsJobsDbJobs();
    const diag = getLastRunDiagnostics();

    console.log('\n--- ATS-JOBS-DB SMOKE TEST ---\n');
    console.log(`Status:           ${diag.firstResponseStatus}`);
    console.log(`Quota remaining:  ${diag.rateLimitRemaining ?? 'n/a'}`);
    console.log(`API calls:        ${diag.apiCallsUsed}`);
    console.log(`Jobs returned:    ${jobs.length}`);
    console.log(`Elapsed:          ${((Date.now() - start) / 1000).toFixed(1)}s`);
    if (diag.abortReasons.length > 0) {
        console.log(`Abort reasons:    ${diag.abortReasons.join(', ')}`);
    }
    if (diag.firstResponseBodySample) {
        console.log(`\nFirst response body sample (300 chars):`);
        console.log(diag.firstResponseBodySample);
    }
    if (jobs[0]) {
        console.log(`\nFirst parsed job (after our mapping):`);
        console.log(JSON.stringify(jobs[0], null, 2));
    }
}

main().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
});
