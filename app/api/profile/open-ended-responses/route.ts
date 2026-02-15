import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

// GET — fetch all open-ended responses for current user
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id }, select: { id: true },
        })
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

        const responses = await prisma.candidateOpenEndedResponse.findMany({
            where: { userId: profile.id },
            orderBy: { createdAt: 'asc' },
        })

        return NextResponse.json(responses)
    } catch (err) {
        console.error('Open-ended responses GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
