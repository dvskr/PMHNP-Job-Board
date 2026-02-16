import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { sanitizeText } from '@/lib/sanitize'

// GET — fetch all references for current user
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id }, select: { id: true },
        })
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

        const refs = await prisma.candidateReference.findMany({
            where: { userId: profile.id },
            orderBy: { createdAt: 'asc' },
        })

        return NextResponse.json(refs)
    } catch (err) {
        console.error('References GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST — create a new reference
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id }, select: { id: true },
        })
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

        const body = await request.json()
        const { fullName, title, organization, phone, email, relationship, yearsKnown } = body

        if (!fullName) {
            return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
        }

        const ref = await prisma.candidateReference.create({
            data: {
                userId: profile.id,
                fullName: sanitizeText(fullName, 200),
                title: title ? sanitizeText(title, 200) : null,
                organization: organization ? sanitizeText(organization, 200) : null,
                phone: phone ? sanitizeText(phone, 30) : null,
                email: email ? sanitizeText(email, 200) : null,
                relationship: relationship ? sanitizeText(relationship, 100) : null,
                yearsKnown: yearsKnown ? parseInt(yearsKnown, 10) || null : null,
            },
        })

        return NextResponse.json(ref, { status: 201 })
    } catch (err) {
        console.error('Reference POST error:', err)
        return NextResponse.json({ error: 'Failed to create reference' }, { status: 500 })
    }
}
