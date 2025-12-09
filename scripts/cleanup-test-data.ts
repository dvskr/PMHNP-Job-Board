import { config } from 'dotenv'
import { prisma } from '../lib/prisma.ts'

// Load environment variables
config()

async function cleanup() {
  console.log('Starting cleanup...')
  
  // Delete jobs with "test" in title (case insensitive)
  const testJobs = await prisma.job.findMany({
    where: {
      OR: [
        { title: { contains: 'test', mode: 'insensitive' } },
        { employer: { contains: 'test', mode: 'insensitive' } },
      ],
    },
  })
  
  console.log(`Found ${testJobs.length} test jobs to delete`)
  
  for (const job of testJobs) {
    // Delete related employer job first
    await prisma.employerJob.deleteMany({
      where: { jobId: job.id },
    })
    
    // Delete job
    await prisma.job.delete({
      where: { id: job.id },
    })
    
    console.log(`Deleted: ${job.title}`)
  }
  
  console.log('Cleanup complete!')
}

cleanup()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

