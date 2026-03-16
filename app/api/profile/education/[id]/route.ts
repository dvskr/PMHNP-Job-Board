import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { sanitizeText } from '@/lib/sanitize'

// PUT — update an existing education entry
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id } = await params

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true },
        })
        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }

        const existing = await prisma.candidateEducation.findFirst({
            where: { id, userId: profile.id },
        })
        if (!existing) {
            return NextResponse.json({ error: 'Education entry not found' }, { status: 404 })
        }

        const body = await request.json()
        const { degreeType, fieldOfStudy, schoolName, startDate, graduationDate, gpa, isHighestDegree } = body

        // If marking as highest degree, unmark any existing one
        if (isHighestDegree && !existing.isHighestDegree) {
            await prisma.candidateEducation.updateMany({
                where: { userId: profile.id, isHighestDegree: true },
                data: { isHighestDegree: false },
            })
        }

        const updated = await prisma.candidateEducation.update({
            where: { id },
            data: {
                ...(degreeType !== undefined && {
                    degreeType: sanitizeText(degreeType, 50),
                }),
                ...(fieldOfStudy !== undefined && {
                    fieldOfStudy: fieldOfStudy ? sanitizeText(fieldOfStudy, 200) : null,
                }),
                ...(schoolName !== undefined && {
                    schoolName: sanitizeText(schoolName, 200),
                }),
                ...(startDate !== undefined && {
                    startDate: startDate ? new Date(startDate) : null,
                }),
                ...(graduationDate !== undefined && {
                    graduationDate: graduationDate ? new Date(graduationDate) : null,
                }),
                ...(gpa !== undefined && {
                    gpa: gpa ? sanitizeText(gpa, 10) : null,
                }),
                ...(isHighestDegree !== undefined && { isHighestDegree }),
            },
        })

        return NextResponse.json(updated)
    } catch (err) {
        console.error('Education PUT error:', err)
        return NextResponse.json({ error: 'Failed to update education entry' }, { status: 500 })
    }
}

// DELETE — delete an education entry
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id } = await params

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true },
        })
        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }

        const existing = await prisma.candidateEducation.findFirst({
            where: { id, userId: profile.id },
        })
        if (!existing) {
            return NextResponse.json({ error: 'Education entry not found' }, { status: 404 })
        }

        await prisma.candidateEducation.delete({ where: { id } })

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Education DELETE error:', err)
        return NextResponse.json({ error: 'Failed to delete education entry' }, { status: 500 })
    }
}
