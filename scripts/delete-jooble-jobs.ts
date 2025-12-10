import { prisma } from '../lib/prisma'

async function deleteJoobleJobs() {
  console.log('Deleting Jooble jobs...\n')
  
  // Count first
  const count = await prisma.job.count({
    where: { sourceProvider: 'jooble' }
  })
  
  console.log(`Found ${count} Jooble jobs`)
  
  if (count === 0) {
    console.log('No Jooble jobs to delete.')
    return
  }
  
  // Delete them
  const result = await prisma.job.deleteMany({
    where: { sourceProvider: 'jooble' }
  })
  
  console.log(`\n✅ Deleted ${result.count} Jooble jobs`)
}

deleteJoobleJobs()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

