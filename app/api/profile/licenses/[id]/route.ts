import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { sanitizeText } from '@/lib/sanitize'

const VALID_LICENSE_TYPES = ['RN', 'APRN', 'Compact (NLC)', 'Compact (APRN)']
const VALID_STATUSES = ['active', 'inactive', 'restricted']

// PUT — update an existing license
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

        // Verify ownership
        const existing = await prisma.candidateLicense.findFirst({
            where: { id, userId: profile.id },
        })
        if (!existing) {
            return NextResponse.json({ error: 'License not found' }, { status: 404 })
        }

        const body = await request.json()
        const { licenseType, licenseNumber, licenseState, expirationDate, status } = body

        const updated = await prisma.candidateLicense.update({
            where: { id },
            data: {
                ...(licenseType !== undefined && VALID_LICENSE_TYPES.includes(licenseType) && {
                    licenseType: sanitizeText(licenseType, 50),
                }),
                ...(licenseNumber !== undefined && {
                    licenseNumber: sanitizeText(licenseNumber, 100),
                }),
                ...(licenseState !== undefined && {
                    licenseState: sanitizeText(licenseState, 10),
                }),
                ...(expirationDate !== undefined && {
                    expirationDate: expirationDate ? new Date(expirationDate) : null,
                }),
                ...(status !== undefined && VALID_STATUSES.includes(status) && {
                    status,
                }),
            },
        })

        return NextResponse.json(updated)
    } catch (err) {
        console.error('License PUT error:', err)
        return NextResponse.json({ error: 'Failed to update license' }, { status: 500 })
    }
}

// DELETE — delete a license
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

        // Verify ownership
        const existing = await prisma.candidateLicense.findFirst({
            where: { id, userId: profile.id },
        })
        if (!existing) {
            return NextResponse.json({ error: 'License not found' }, { status: 404 })
        }

        await prisma.candidateLicense.delete({ where: { id } })

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('License DELETE error:', err)
        return NextResponse.json({ error: 'Failed to delete license' }, { status: 500 })
    }
}
