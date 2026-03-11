import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendSavedJobReminderEmail } from '@/lib/email-service'

export const maxDuration = 120 // 2 minutes — saved job reminder emails

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        // Find saved jobs that are 3+ days old (user hasn't applied)
        const threeDaysAgo = new Date()
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

        // Get users who have saved jobs > 3 days ago
        const savedJobs = await prisma.savedJob.findMany({
            where: {
                savedAt: { lte: threeDaysAgo },
            },
        })

        if (savedJobs.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No saved jobs older than 3 days',
                remindersSent: 0,
            })
        }

        // Group by userId
        const userJobMap = new Map<string, string[]>()
        for (const sj of savedJobs) {
            const existing = userJobMap.get(sj.userId) || []
            existing.push(sj.jobId)
            userJobMap.set(sj.userId, existing)
        }

        let sentCount = 0
        const errors: string[] = []

        for (const [userId, jobIds] of userJobMap) {
            try {
                // Get user profile
                const profile = await prisma.userProfile.findUnique({
                    where: { supabaseId: userId },
                    select: { email: true, firstName: true },
                })

                if (!profile) continue

                // Get job details (only active/published jobs)
                const jobs = await prisma.job.findMany({
                    where: {
                        id: { in: jobIds },
                        isPublished: true,
                        OR: [
                            { expiresAt: null },
                            { expiresAt: { gt: new Date() } },
                        ],
                    },
                    select: {
                        title: true,
                        employer: true,
                        location: true,
                        slug: true,
                    },
                })

                if (jobs.length === 0) continue

                // Filter out jobs without slugs
                const validJobs = jobs.filter(j => j.slug) as Array<{ title: string; employer: string; location: string; slug: string }>

                if (validJobs.length === 0) continue

                await sendSavedJobReminderEmail(
                    profile.email,
                    profile.firstName,
                    validJobs
                )
                sentCount++
            } catch (e) {
                errors.push(`User ${userId}: ${e}`)
            }

            if (sentCount % 10 === 0) {
                await new Promise(r => setTimeout(r, 1000))
            }
        }

        return NextResponse.json({
            success: true,
            usersProcessed: userJobMap.size,
            remindersSent: sentCount,
            errors,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('Saved job reminder cron error:', error)
        return NextResponse.json({ error: 'Saved job reminder failed' }, { status: 500 })
    }
}
