import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { sanitizeText } from '@/lib/sanitize'

// PUT — upsert a single open-ended response by questionKey
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ questionKey: string }> }
) {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { questionKey } = await params

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id }, select: { id: true },
        })
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

        const body = await request.json()
        const { questionText, response: responseText } = body

        if (!responseText || !responseText.trim()) {
            // Delete if empty response
            await prisma.candidateOpenEndedResponse.deleteMany({
                where: { userId: profile.id, questionKey },
            })
            return NextResponse.json({ success: true, deleted: true })
        }

        const result = await prisma.candidateOpenEndedResponse.upsert({
            where: {
                userId_questionKey: {
                    userId: profile.id,
                    questionKey,
                },
            },
            update: {
                response: sanitizeText(responseText, 2000),
                isAIGenerated: false,
            },
            create: {
                userId: profile.id,
                questionKey,
                questionText: sanitizeText(questionText || questionKey, 500),
                response: sanitizeText(responseText, 2000),
                isAIGenerated: false,
            },
        })

        return NextResponse.json(result)
    } catch (err) {
        console.error('Open-ended response PUT error:', err)
        return NextResponse.json({ error: 'Failed to save response' }, { status: 500 })
    }
}
