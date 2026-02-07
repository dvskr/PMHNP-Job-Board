import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local if it exists
config({ path: resolve(process.cwd(), '.env.local') });

import { fetchJSearchJobs } from '../lib/aggregators/jsearch';

async function test() {
    console.log('Testing JSearch aggregator...\n');

    if (!process.env.RAPIDAPI_KEY) {
        console.error('ERROR: RAPIDAPI_KEY not set in .env.local');
        process.exit(1);
    }

    const jobs = await fetchJSearchJobs();

    console.log(`\n✅ Fetched ${jobs.length} PMHNP jobs`);
    console.log('\nFetched Job Titles:');
    jobs.slice(0, 10).forEach((job, i) => console.log(`${i + 1}. ${job.title} @ ${job.employer}`));

    if (jobs.length > 0) {
        console.log('\nSample job:');
        console.log(JSON.stringify(jobs[0], null, 2));

        // Show source breakdown
        // Show source breakdown
        const sourceCounts = jobs.reduce((acc: Record<string, number>, job) => {
            const source = (job.sourceSite as string) || 'Unknown';
            acc[source] = (acc[source] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        console.log('\n📊 Jobs by Original Source (job board):');
        Object.entries(sourceCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([source, count]) => {
                console.log(`  ${source}: ${count}`);
            });

        // Show employer breakdown
        const employerCounts = jobs.reduce((acc: Record<string, number>, job) => {
            const employer = (job.employer as string) || 'Unknown';
            acc[employer] = (acc[employer] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        console.log('\n🏢 Top Employers:');
        Object.entries(employerCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .forEach(([employer, count]) => {
                console.log(`  ${employer}: ${count}`);
            });

        // Show salary data availability
        const withSalary = jobs.filter(j => j.minSalary || j.maxSalary).length;
        console.log(`\n💰 Jobs with salary data: ${withSalary}/${jobs.length} (${((withSalary / jobs.length) * 100).toFixed(1)}%)`);

        // Show remote breakdown
        const remoteJobs = jobs.filter(j => j.isRemote).length;
        console.log(`🏠 Remote jobs: ${remoteJobs}/${jobs.length} (${((remoteJobs / jobs.length) * 100).toFixed(1)}%)`);
    }
}

test().catch(console.error);
