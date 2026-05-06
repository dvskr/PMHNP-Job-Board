/**
 * One-call smoke test using the FULL adapter (so the schema mapping
 * is exercised end-to-end). Costs 1 request.
 */
import 'dotenv/config';

const KEY_OVERRIDE = process.argv[2];
if (KEY_OVERRIDE) process.env.RAPIDAPI_KEY = KEY_OVERRIDE;

async function main() {
    const { fetchAtsJobsDbJobs, getLastRunDiagnostics } = await import('@/lib/aggregators/ats-jobs-db');
    const jobs = await fetchAtsJobsDbJobs();
    const diag = getLastRunDiagnostics();

    console.log('\n--- ADAPTER SMOKE TEST ---');
    console.log(`Status:           ${diag.firstResponseStatus}`);
    console.log(`Quota remaining:  ${diag.rateLimitRemaining}`);
    console.log(`API calls used:   ${diag.apiCallsUsed}`);
    console.log(`Jobs returned:    ${jobs.length}`);
    console.log();
    if (jobs[0]) {
        console.log('First mapped job:');
        console.log(JSON.stringify({
            externalId: jobs[0].externalId,
            title: jobs[0].title,
            company: jobs[0].company,
            location: jobs[0].location,
            applyLink: jobs[0].applyLink,
            jobType: jobs[0].jobType,
            mode: jobs[0].mode,
            minSalary: jobs[0].minSalary,
            maxSalary: jobs[0].maxSalary,
            salaryPeriod: jobs[0].salaryPeriod,
            postedDate: jobs[0].postedDate,
            sourceSite: jobs[0].sourceSite,
            is_remote: jobs[0].is_remote,
            description_length: jobs[0].description?.length ?? 0,
        }, null, 2));
    }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
