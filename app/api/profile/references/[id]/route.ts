import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { sanitizeText } from '@/lib/sanitize'

// PUT — update an existing reference
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const { id } = await params

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id }, select: { id: true },
        })
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

        const existing = await prisma.candidateReference.findFirst({
            where: { id, userId: profile.id },
        })
        if (!existing) return NextResponse.json({ error: 'Reference not found' }, { status: 404 })

        const body = await request.json()
        const { fullName, title, organization, phone, email, relationship, yearsKnown } = body

        const updated = await prisma.candidateReference.update({
            where: { id },
            data: {
                ...(fullName !== undefined && { fullName: sanitizeText(fullName, 200) }),
                ...(title !== undefined && { title: title ? sanitizeText(title, 200) : null }),
                ...(organization !== undefined && { organization: organization ? sanitizeText(organization, 200) : null }),
                ...(phone !== undefined && { phone: phone ? sanitizeText(phone, 30) : null }),
                ...(email !== undefined && { email: email ? sanitizeText(email, 200) : null }),
                ...(relationship !== undefined && { relationship: relationship ? sanitizeText(relationship, 100) : null }),
                ...(yearsKnown !== undefined && { yearsKnown: yearsKnown ? parseInt(yearsKnown, 10) || null : null }),
            },
        })

        return NextResponse.json(updated)
    } catch (err) {
        console.error('Reference PUT error:', err)
        return NextResponse.json({ error: 'Failed to update reference' }, { status: 500 })
    }
}

// DELETE — delete a reference
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const { id } = await params

        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id }, select: { id: true },
        })
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

        const existing = await prisma.candidateReference.findFirst({
            where: { id, userId: profile.id },
        })
        if (!existing) return NextResponse.json({ error: 'Reference not found' }, { status: 404 })

        await prisma.candidateReference.delete({ where: { id } })
        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Reference DELETE error:', err)
        return NextResponse.json({ error: 'Failed to delete reference' }, { status: 500 })
    }
}
