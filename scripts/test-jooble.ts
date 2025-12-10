import { fetchJoobleJobs } from '../lib/aggregators/jooble'

async function test() {
  console.log('Testing Jooble aggregator...\n')
  
  const jobs = await fetchJoobleJobs()
  
  console.log(`\n✅ Fetched ${jobs.length} jobs`)
  
  if (jobs.length > 0) {
    console.log('\nSample job:')
    console.log(JSON.stringify(jobs[0], null, 2))
  }
}

test().catch(console.error)

