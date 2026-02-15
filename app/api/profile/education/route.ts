import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { sanitizeText } from '@/lib/sanitize'

const VALID_DEGREES = ['DNP', 'PhD', 'MSN', 'EdD', "Post-Master's Certificate", 'BSN', 'ADN']

// GET — fetch all education entries for the current user
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true },
        })
        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }

        const education = await prisma.candidateEducation.findMany({
            where: { userId: profile.id },
            orderBy: { graduationDate: 'desc' },
        })

        return NextResponse.json(education)
    } catch (err) {
        console.error('Education GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST — create a new education entry
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { id: true },
        })
        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }

        const body = await request.json()
        const { degreeType, fieldOfStudy, schoolName, graduationDate, gpa, isHighestDegree } = body

        if (!degreeType || !schoolName) {
            return NextResponse.json(
                { error: 'Degree type and school name are required' },
                { status: 400 }
            )
        }

        // If marking as highest degree, unmark any existing one
        if (isHighestDegree) {
            await prisma.candidateEducation.updateMany({
                where: { userId: profile.id, isHighestDegree: true },
                data: { isHighestDegree: false },
            })
        }

        const entry = await prisma.candidateEducation.create({
            data: {
                userId: profile.id,
                degreeType: sanitizeText(degreeType, 50),
                fieldOfStudy: fieldOfStudy ? sanitizeText(fieldOfStudy, 200) : null,
                schoolName: sanitizeText(schoolName, 200),
                graduationDate: graduationDate ? new Date(graduationDate) : null,
                gpa: gpa ? sanitizeText(gpa, 10) : null,
                isHighestDegree: isHighestDegree ?? false,
            },
        })

        return NextResponse.json(entry, { status: 201 })
    } catch (err) {
        console.error('Education POST error:', err)
        return NextResponse.json({ error: 'Failed to create education entry' }, { status: 500 })
    }
}
