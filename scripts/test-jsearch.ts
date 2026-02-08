
import 'dotenv/config';
import { fetchJSearchJobs } from '../lib/aggregators/jsearch';

async function main() {
    console.log('🧪 Testing JSearch Aggregator...');

    if (!process.env.RAPIDAPI_KEY) {
        console.error('❌ RAPIDAPI_KEY is missing in .env');
        process.exit(1);
    }

    try {
        // Test with limited scope: 1 query, 1 page
        const jobs = await fetchJSearchJobs({
            pagesPerQuery: 1,
            specificQueries: ['PMHNP']
        });

        console.log(`\n✅ Fetched ${jobs.length} jobs.`);

        if (jobs.length > 0) {
            console.log('\n📄 Sample Job 1:');
            console.log(JSON.stringify(jobs[0], null, 2));

            const remoteJobs = jobs.filter(j => j.isRemote);
            console.log(`\n🏠 Remote Jobs Info: ${remoteJobs.length}/${jobs.length}`);

            const expiredRaw = jobs.filter(j => {
                const expiration = j.expiresDate as string | null;
                if (!expiration) return false;
                return new Date(expiration).getTime() < Date.now();
            });
            console.log(`\n⏰ Expired Jobs Included (should be 0 after fix): ${expiredRaw.length}`);
        }

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

main();
