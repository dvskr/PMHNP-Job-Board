import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local if it exists (takes precedence)
config({ path: resolve(process.cwd(), '.env.local') });

import { fetchCareerJetJobs } from '../lib/aggregators/careerjet'

async function test() {
  console.log('Testing CareerJet aggregator...\n')
  
  const jobs = await fetchCareerJetJobs()
  
  console.log(`\n✅ Fetched ${jobs.length} jobs`)
  
  if (jobs.length > 0) {
    console.log('\nSample job:')
    console.log(JSON.stringify(jobs[0], null, 2))
  }
}

test().catch(console.error)

