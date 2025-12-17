import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  // Simple password protection (change this to something secure)
  const { password } = await request.json()
  
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    // Find test jobs
    const testJobs = await prisma.job.findMany({
      where: {
        OR: [
          { title: { contains: 'test', mode: 'insensitive' } },
          { employer: { contains: 'test', mode: 'insensitive' } },
        ],
      },
    })
    
    let deletedCount = 0
    
    for (const job of testJobs) {
      // Delete related employer job first
      await prisma.employerJob.deleteMany({
        where: { jobId: job.id },
      })
      
      // Delete job
      await prisma.job.delete({
        where: { id: job.id },
      })
      
      deletedCount++
    }
    
    return NextResponse.json({ 
      success: true, 
      deletedCount,
      jobs: testJobs.map((j: typeof testJobs[number]) => ({ id: j.id, title: j.title, employer: j.employer }))
    })
  } catch (error) {
    console.error('Cleanup error:', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}

