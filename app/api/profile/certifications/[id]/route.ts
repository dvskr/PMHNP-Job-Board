import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { sanitizeText } from '@/lib/sanitize'

// PUT — update an existing certification
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

        const existing = await prisma.candidateCertification.findFirst({
            where: { id, userId: profile.id },
        })
        if (!existing) {
            return NextResponse.json({ error: 'Certification not found' }, { status: 404 })
        }

        const body = await request.json()
        const { certificationName, certifyingBody, certificationNumber, expirationDate } = body

        const updated = await prisma.candidateCertification.update({
            where: { id },
            data: {
                ...(certificationName !== undefined && {
                    certificationName: sanitizeText(certificationName, 100),
                }),
                ...(certifyingBody !== undefined && {
                    certifyingBody: certifyingBody ? sanitizeText(certifyingBody, 100) : null,
                }),
                ...(certificationNumber !== undefined && {
                    certificationNumber: certificationNumber ? sanitizeText(certificationNumber, 100) : null,
                }),
                ...(expirationDate !== undefined && {
                    expirationDate: expirationDate ? new Date(expirationDate) : null,
                }),
            },
        })

        return NextResponse.json(updated)
    } catch (err) {
        console.error('Certification PUT error:', err)
        return NextResponse.json({ error: 'Failed to update certification' }, { status: 500 })
    }
}

// DELETE — delete a certification
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

        const existing = await prisma.candidateCertification.findFirst({
            where: { id, userId: profile.id },
        })
        if (!existing) {
            return NextResponse.json({ error: 'Certification not found' }, { status: 404 })
        }

        await prisma.candidateCertification.delete({ where: { id } })

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Certification DELETE error:', err)
        return NextResponse.json({ error: 'Failed to delete certification' }, { status: 500 })
    }
}
