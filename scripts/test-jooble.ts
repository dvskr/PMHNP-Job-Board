
import 'dotenv/config';
import { fetchJoobleJobs } from '../lib/aggregators/jooble';

async function testJooble() {
    console.log('🧪 Testing Jooble Aggregator...');

    if (!process.env.JOOBLE_API_KEY) {
        console.error('❌ JOOBLE_API_KEY is missing in .env');
        process.exit(1);
    }

    try {
        const jobs = await fetchJoobleJobs();

        console.log(`\n✅ Fetched ${jobs.length} jobs.`);

        if (jobs.length > 0) {
            console.log('\n📄 Sample Job:');
            console.log(JSON.stringify(jobs[0], null, 2));

            // Check fields
            const job = jobs[0];
            const requiredFields = ['title', 'company', 'location', 'description', 'url', 'id'];
            requiredFields.forEach(f => {
                if (!(f in job)) console.warn(`⚠️ Warning: Missing field "${f}"`);
            });
        }

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testJooble();
