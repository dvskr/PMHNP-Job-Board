import { config } from 'dotenv'
import { prisma } from '../lib/prisma.ts'

// Load environment variables
config()

async function fixAdzunaSalaries() {
  console.log('Fixing Adzuna salary values...')
  
  // Find all jobs from Adzuna source with non-null salaries
  const adzunaJobs = await prisma.job.findMany({
    where: {
      sourceProvider: 'adzuna',
      OR: [
        { minSalary: { not: null } },
        { maxSalary: { not: null } },
      ],
    },
  })
  
  console.log(`Found ${adzunaJobs.length} Adzuna jobs with salaries`)
  
  let updatedCount = 0
  
  for (const job of adzunaJobs) {
    // Check if salary looks like it's in thousands (< 10000 means it's likely in k format)
    const needsFix = (job.minSalary && job.minSalary < 10000) || (job.maxSalary && job.maxSalary < 10000)
    
    if (needsFix) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          minSalary: job.minSalary ? job.minSalary * 1000 : null,
          maxSalary: job.maxSalary ? job.maxSalary * 1000 : null,
        },
      })
      
      console.log(`Fixed: ${job.title} - ${job.minSalary}k → $${job.minSalary ? job.minSalary * 1000 : 0}`)
      updatedCount++
    }
  }
  
  console.log(`\nFixed ${updatedCount} jobs!`)
}

fixAdzunaSalaries()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

