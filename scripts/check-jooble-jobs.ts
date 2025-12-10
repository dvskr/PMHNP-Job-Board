import { prisma } from '../lib/prisma'

async function checkJoobleJobs() {
  console.log('Checking Jooble jobs in database...\n')
  
  const jobs = await prisma.job.findMany({
    where: {
      sourceProvider: 'jooble'
    },
    select: {
      id: true,
      title: true,
      employer: true,
      description: true,
      descriptionSummary: true,
    },
    take: 2
  })

  console.log(`Found ${jobs.length} Jooble jobs\n`)

  for (const job of jobs) {
    console.log('Job ID:', job.id)
    console.log('Title:', job.title)
    console.log('Employer:', job.employer)
    console.log('\nDescription length:', job.description?.length || 0)
    console.log('Description (first 200 chars):', job.description?.substring(0, 200))
    console.log('\nDescription Summary length:', job.descriptionSummary?.length || 0)
    console.log('Description Summary:', job.descriptionSummary)
    console.log('\n' + '='.repeat(80) + '\n')
  }
}

checkJoobleJobs()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

