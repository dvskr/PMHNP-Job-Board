import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/applications — Log a job application
 * Body: { jobId: string, sourceUrl?: string }
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { jobId, sourceUrl } = body

        if (!jobId || typeof jobId !== 'string') {
            return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
        }

        // Upsert — don't duplicate if user already applied
        const application = await prisma.jobApplication.upsert({
            where: {
                userId_jobId: { userId: user.id, jobId },
            },
            update: {}, // no-op if exists
            create: {
                userId: user.id,
                jobId,
                sourceUrl: sourceUrl || null,
            },
        })

        return NextResponse.json({ success: true, id: application.id })
    } catch (error) {
        console.error('Error logging application:', error)
        return NextResponse.json({ error: 'Failed to log application' }, { status: 500 })
    }
}

/**
 * GET /api/applications — Fetch user's applications with job details
 */
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const applications = await prisma.jobApplication.findMany({
            where: { userId: user.id },
            orderBy: { appliedAt: 'desc' },
            take: 50,
            include: {
                job: {
                    select: {
                        id: true,
                        title: true,
                        slug: true,
                        employer: true,
                        location: true,
                        jobType: true,
                        mode: true,
                        displaySalary: true,
                        isPublished: true,
                    },
                },
            },
        })

        return NextResponse.json(applications)
    } catch (error) {
        console.error('Error fetching applications:', error)
        return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 })
    }
}
