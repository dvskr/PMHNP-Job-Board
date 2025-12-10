import { fetchLeverJobs } from '../lib/aggregators/lever'

async function test() {
  console.log('Testing Lever aggregator...\n')
  
  const jobs = await fetchLeverJobs()
  
  console.log(`\n✅ Fetched ${jobs.length} jobs`)
  
  if (jobs.length > 0) {
    console.log('\nSample job:')
    console.log(JSON.stringify(jobs[0], null, 2))
    
    // Show company breakdown
    const companyCounts = jobs.reduce((acc, job) => {
      acc[job.company] = (acc[job.company] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    console.log('\n📊 Jobs by Company:')
    Object.entries(companyCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([company, count]) => {
        console.log(`  ${company}: ${count}`)
      })
  }
}

test().catch(console.error)

