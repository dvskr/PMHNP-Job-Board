import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'

// GET: List saved jobs for current user
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const savedJobs = await prisma.savedJob.findMany({
            where: { userId: user.id },
            orderBy: { savedAt: 'desc' },
        })

        return NextResponse.json({ savedJobs })
    } catch (error) {
        console.error('Error fetching saved jobs:', error)
        return NextResponse.json({ error: 'Failed to fetch saved jobs' }, { status: 500 })
    }
}

// POST: Save a job
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { jobId } = await request.json()
        if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })

        const savedJob = await prisma.savedJob.upsert({
            where: { userId_jobId: { userId: user.id, jobId } },
            create: { userId: user.id, jobId },
            update: {},  // no-op if already exists
        })

        return NextResponse.json({ savedJob })
    } catch (error) {
        console.error('Error saving job:', error)
        return NextResponse.json({ error: 'Failed to save job' }, { status: 500 })
    }
}

// DELETE: Unsave a job
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { jobId } = await request.json()
        if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })

        await prisma.savedJob.deleteMany({
            where: { userId: user.id, jobId },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error unsaving job:', error)
        return NextResponse.json({ error: 'Failed to unsave job' }, { status: 500 })
    }
}
