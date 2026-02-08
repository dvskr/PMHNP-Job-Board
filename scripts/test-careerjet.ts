
import 'dotenv/config';
import { fetchCareerJetJobs } from '../lib/aggregators/careerjet';

async function testCareerJet() {
    console.log('🧪 Testing Careerjet Aggregator...');

    if (!process.env.CAREERJET_AFFILIATE_ID) {
        console.warn('⚠️ CAREERJET_AFFILIATE_ID is missing in .env');
        console.log('Attempting fetch anyway (some public calls might work depending on endpoint)...');
    }

    try {
        const jobs = await fetchCareerJetJobs();

        console.log(`\n✅ Fetched ${jobs.length} jobs.`);

        if (jobs.length > 0) {
            console.log('\n📄 Sample Job:');
            console.log(JSON.stringify(jobs[0], null, 2));

            // Check fields
            const job = jobs[0];
            const requiredFields = ['title', 'employer', 'location', 'description', 'applyLink', 'externalId'];
            requiredFields.forEach(f => {
                if (!(f in job)) console.warn(`⚠️ Warning: Missing field "${f}"`);
                else if (!job[f as keyof typeof job]) console.warn(`⚠️ Warning: Field "${f}" is empty`);
            });
        }

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testCareerJet();
