import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function POST() {
  try {
    // Find all Adzuna jobs with salaries that need fixing (< 10000 means stored in thousands)
    const adzunaJobs = await prisma.job.findMany({
      where: {
        sourceProvider: 'adzuna',
        OR: [
          {
            minSalary: {
              not: null,
              lt: 10000
            }
          },
          {
            maxSalary: {
              not: null,
              lt: 10000
            }
          },
        ],
      },
    })

    logger.info(`Found ${adzunaJobs.length} Adzuna jobs with salaries to fix`)

    let updatedCount = 0
    const updates = []

    for (const job of adzunaJobs) {
      const oldMin = job.minSalary
      const oldMax = job.maxSalary
      const newMin = job.minSalary ? job.minSalary * 1000 : null
      const newMax = job.maxSalary ? job.maxSalary * 1000 : null

      await prisma.job.update({
        where: { id: job.id },
        data: {
          minSalary: newMin,
          maxSalary: newMax,
        },
      })

      updates.push({
        id: job.id,
        title: job.title,
        oldSalary: `$${oldMin}k - $${oldMax}k`,
        newSalary: `$${newMin} - $${newMax}`,
      })

      updatedCount++
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      updates,
    })
  } catch (error) {
    logger.error('Fix salaries error', error)
    return NextResponse.json({ error: 'Failed to fix salaries' }, { status: 500 })
  }
}

