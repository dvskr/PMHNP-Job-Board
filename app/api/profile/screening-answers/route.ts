import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { sanitizeText } from '@/lib/sanitize'

// GET — fetch all screening answers for current user
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id }, select: { id: true },
        })
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

        const answers = await prisma.candidateScreeningAnswer.findMany({
            where: { userId: profile.id },
            orderBy: { createdAt: 'asc' },
        })

        return NextResponse.json(answers)
    } catch (err) {
        console.error('Screening answers GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PUT — bulk upsert screening answers
export async function PUT(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id }, select: { id: true },
        })
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

        const body = await request.json()
        const { answers } = body

        if (!Array.isArray(answers)) {
            return NextResponse.json({ error: 'answers must be an array' }, { status: 400 })
        }

        // Use a transaction for bulk upsert
        const results = await prisma.$transaction(
            answers.map((a: {
                questionKey: string
                questionText: string
                answerType: string
                answerBool?: boolean | null
                answerText?: string | null
                category: string
            }) =>
                prisma.candidateScreeningAnswer.upsert({
                    where: {
                        userId_questionKey: {
                            userId: profile.id,
                            questionKey: a.questionKey,
                        },
                    },
                    update: {
                        answerBool: a.answerBool ?? null,
                        answerText: a.answerText ? sanitizeText(a.answerText, 2000) : null,
                    },
                    create: {
                        userId: profile.id,
                        questionKey: a.questionKey,
                        questionText: sanitizeText(a.questionText, 500),
                        answerType: a.answerType,
                        answerBool: a.answerBool ?? null,
                        answerText: a.answerText ? sanitizeText(a.answerText, 2000) : null,
                        category: a.category,
                    },
                })
            )
        )

        return NextResponse.json(results)
    } catch (err) {
        console.error('Screening answers PUT error:', err)
        return NextResponse.json({ error: 'Failed to save screening answers' }, { status: 500 })
    }
}
