import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Helper function to detect if a salary is hourly based on the job description
function detectHourlySalary(description: string, title: string, salary: number | null): boolean {
  if (!salary) return false
  
  const text = `${title} ${description}`.toLowerCase()
  
  // Check for hourly indicators
  const hourlyPatterns = [
    /\$\d+\s*(?:per\s*)?(?:hour|hr|hourly)/i,
    /\bhourly\s+rate\b/i,
    /\bper\s+hour\b/i,
  ]
  
  const hasHourlyKeyword = hourlyPatterns.some(pattern => pattern.test(text))
  
  // If salary is < 500 and period is 'year', it's likely hourly (e.g. $127/hour, not $127k/year)
  const likelyHourly = salary < 500
  
  return hasHourlyKeyword || likelyHourly
}

export async function POST(request: NextRequest) {
  try {
    // Find all jobs with salaries < 500 and period 'year' (likely hourly rates misclassified)
    const suspectJobs = await prisma.job.findMany({
      where: {
        salaryPeriod: 'year',
        OR: [
          { minSalary: { not: null, lt: 500 } },
          { maxSalary: { not: null, lt: 500 } },
        ],
      },
    })
    
    console.log(`Found ${suspectJobs.length} jobs with suspect salary periods`)
    
    let updatedCount = 0
    const updates = []
    
    for (const job of suspectJobs) {
      const isHourly = detectHourlySalary(job.description, job.title, job.minSalary || job.maxSalary)
      
      if (isHourly) {
        await prisma.job.update({
          where: { id: job.id },
          data: {
            salaryPeriod: 'hour',
          },
        })
        
        updates.push({
          id: job.id,
          title: job.title,
          salary: `$${job.minSalary || job.maxSalary}`,
          changed: 'year → hour',
        })
        
        updatedCount++
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      updatedCount,
      updates,
    })
  } catch (error) {
    console.error('Fix salary periods error:', error)
    return NextResponse.json({ error: 'Failed to fix salary periods' }, { status: 500 })
  }
}

