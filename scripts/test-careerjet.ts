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

